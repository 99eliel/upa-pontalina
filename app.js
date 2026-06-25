import {
  auth, db, googleProvider,
  signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendPasswordResetEmail, updateProfile, onAuthStateChanged, signOut,
  doc, getDoc, setDoc, updateDoc, collection, query, orderBy, onSnapshot, serverTimestamp
} from './firebase.js';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const state = {
  firebaseUser: null,
  perfil: null,
  usuarios: [],
  avisos: [],
  fila: 0,
  deferredPrompt: null
};

const permissoesPadrao = {
  upa: false,
  esf: false,
  laboratorio: false,
  cetec: false,
  avisos: false,
  relatorios: false,
  escalas: false,
  agendamentos: false,
  usuarios: false
};

const esfUnidades = [
  ['ESF 201 - Rural', 'Atendimento conforme escala da unidade.'],
  ['ESF 301 - Jardim Frei Walter', 'Atendimento de rotina e acompanhamento familiar.'],
  ['ESF 302 - Santa Rita de Cássia', 'Atendimento de rotina e acompanhamento familiar.'],
  ['ESF 303 - Dr. Antônio Carlos', 'Atendimento de rotina e acompanhamento familiar.'],
  ['ESF 304 - Lázaro Teodoro', 'Atendimento de rotina e acompanhamento familiar.'],
  ['ESF 305 - Aluísio Borges', 'Atendimento de rotina e acompanhamento familiar.']
];

function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.remove('hidden');
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => el.classList.add('hidden'), 3500);
}

function formatDate(value) {
  if (!value) return '-';
  const date = value.toDate ? value.toDate() : new Date(value);
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function onlyNumbers(value) {
  return String(value || '').replace(/\D/g, '');
}

function isAdminGeral() {
  return state.perfil?.isAdminGeral === true && state.perfil?.role === 'admin_geral';
}

function temPermissao(nome) {
  return isAdminGeral() || state.perfil?.permissoes?.[nome] === true;
}

function usuarioBase(user, extras = {}) {
  return {
    nomeCompleto: extras.nomeCompleto || user.displayName || '',
    celular: onlyNumbers(extras.celular || ''),
    email: user.email || extras.email || '',
    fotoURL: user.photoURL || '',
    role: 'usuario',
    isAdminGeral: false,
    ativo: true,
    cadastroCompleto: Boolean(extras.nomeCompleto && extras.celular),
    criadoEm: serverTimestamp(),
    permissoes: { ...permissoesPadrao }
  };
}

async function garantirUsuario(user, extras = {}) {
  const ref = doc(db, 'usuarios', user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, usuarioBase(user, extras));
  } else if (extras.nomeCompleto || extras.celular) {
    await updateDoc(ref, {
      nomeCompleto: extras.nomeCompleto || snap.data().nomeCompleto || user.displayName || '',
      celular: onlyNumbers(extras.celular || snap.data().celular || ''),
      cadastroCompleto: true
    });
  }
  const finalSnap = await getDoc(ref);
  return { id: finalSnap.id, ...finalSnap.data() };
}

async function carregarPerfil(user) {
  state.firebaseUser = user;
  state.perfil = await garantirUsuario(user);
  if (!state.perfil.ativo) {
    await signOut(auth);
    toast('Seu usuário está desativado. Procure o administrador.');
    return;
  }
  if (!state.perfil.cadastroCompleto || !state.perfil.nomeCompleto || !state.perfil.celular) {
    abrirCompletarCadastro();
  }
  abrirApp();
}

function abrirCompletarCadastro() {
  $('#completeNome').value = state.perfil?.nomeCompleto || state.firebaseUser?.displayName || '';
  $('#completeCelular').value = state.perfil?.celular || '';
  $('#completeProfileModal').classList.remove('hidden');
}

function abrirApp() {
  $('#authScreen').classList.add('hidden');
  $('#appShell').classList.remove('hidden');
  $('#userName').textContent = state.perfil.nomeCompleto || state.firebaseUser.email;
  $('#userRole').textContent = isAdminGeral() ? 'ADM Geral' : state.perfil.role || 'Usuário';
  aplicarPermissoesNaTela();
  escutarUsuarios();
  escutarAvisos();
  renderEsf();
}

function fecharApp() {
  $('#authScreen').classList.remove('hidden');
  $('#appShell').classList.add('hidden');
  state.firebaseUser = null;
  state.perfil = null;
}

function aplicarPermissoesNaTela() {
  $$('.admin-only').forEach((el) => el.classList.add('hidden'));
  const perms = ['upa', 'esf', 'laboratorio', 'cetec', 'avisos', 'relatorios', 'escalas', 'agendamentos', 'usuarios'];
  perms.forEach((perm) => {
    if (temPermissao(perm)) {
      $$(`.perm-${perm}`).forEach((el) => el.classList.remove('hidden'));
    }
  });
}

function abrirPagina(id) {
  $$('.page').forEach((p) => p.classList.remove('active'));
  $$('.menu-item').forEach((b) => b.classList.remove('active'));
  const page = document.getElementById(id);
  if (!page) return;
  page.classList.add('active');
  const btn = $(`.menu-item[data-page="${id}"]`);
  if (btn) btn.classList.add('active');
  $('#pageTitle').textContent = btn?.textContent || page.querySelector('h2')?.textContent || 'ConecteBR';
  $('#pageSubtitle').textContent = 'Pontalina Digital';
  $('.sidebar').classList.remove('open');
}

function escutarUsuarios() {
  if (!temPermissao('relatorios') && !temPermissao('usuarios')) return;
  const q = query(collection(db, 'usuarios'), orderBy('criadoEm', 'desc'));
  onSnapshot(q, (snap) => {
    state.usuarios = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderRelatorios();
    renderUsuarios();
  }, (error) => toast('Erro ao carregar usuários: ' + error.message));
}

function escutarAvisos() {
  if (!temPermissao('avisos')) return;
  const q = query(collection(db, 'avisos'), orderBy('criadoEm', 'desc'));
  onSnapshot(q, (snap) => {
    state.avisos = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderAvisos();
  }, () => {});
}

function renderRelatorios() {
  if (!temPermissao('relatorios')) return;
  const busca = ($('#relatorioBusca')?.value || '').toLowerCase();
  const usuarios = state.usuarios.filter((u) => `${u.nomeCompleto} ${u.email} ${u.celular}`.toLowerCase().includes(busca));
  const mesAtual = new Date().getMonth();
  const anoAtual = new Date().getFullYear();
  $('#statTotal').textContent = state.usuarios.length;
  $('#statAdmins').textContent = state.usuarios.filter((u) => u.isAdminGeral || Object.values(u.permissoes || {}).some(Boolean)).length;
  $('#statAtivos').textContent = state.usuarios.filter((u) => u.ativo).length;
  $('#statMes').textContent = state.usuarios.filter((u) => {
    const d = u.criadoEm?.toDate?.();
    return d && d.getMonth() === mesAtual && d.getFullYear() === anoAtual;
  }).length;
  $('#relatorioTabela').innerHTML = usuarios.map((u) => `
    <tr>
      <td>${u.nomeCompleto || '-'}</td><td>${u.celular || '-'}</td><td>${u.email || '-'}</td>
      <td>${u.isAdminGeral ? 'ADM Geral' : (Object.values(u.permissoes || {}).some(Boolean) ? 'ADM' : 'Usuário')}</td>
      <td>${u.ativo ? 'Sim' : 'Não'}</td><td>${formatDate(u.criadoEm)}</td>
    </tr>
  `).join('');
}

function renderUsuarios() {
  if (!temPermissao('usuarios')) return;
  const busca = ($('#usuariosBusca')?.value || '').toLowerCase();
  const usuarios = state.usuarios.filter((u) => `${u.nomeCompleto} ${u.email} ${u.celular}`.toLowerCase().includes(busca));
  $('#usuariosLista').innerHTML = usuarios.map((u) => {
    const disabled = isAdminGeral() ? '' : 'disabled';
    const perms = Object.keys(permissoesPadrao).map((perm) => `
      <label class="check"><input type="checkbox" data-user="${u.id}" data-perm="${perm}" ${u.permissoes?.[perm] ? 'checked' : ''} ${disabled}> ${perm}</label>
    `).join('');
    return `
      <div class="user-item">
        <div class="user-row">
          <div><strong>${u.nomeCompleto || 'Sem nome'}</strong><br><span class="muted small">${u.email || '-'} • ${u.celular || '-'}</span></div>
          <div class="actions">
            <button class="ghost" data-save-user="${u.id}" ${disabled}>Salvar</button>
            <button class="${u.ativo ? 'danger-outline' : 'primary'}" data-toggle-active="${u.id}" ${disabled}>${u.ativo ? 'Bloquear' : 'Ativar'}</button>
          </div>
        </div>
        <div class="perm-grid">${perms}</div>
      </div>
    `;
  }).join('') || '<p class="muted">Nenhum usuário encontrado.</p>';
}

function renderAvisos() {
  const alvo = $('#listaAvisos');
  if (!alvo) return;
  alvo.innerHTML = state.avisos.map((a) => `
    <div class="notice-item"><strong>${a.mensagem || '-'}</strong><br><span class="muted small">${formatDate(a.criadoEm)}</span></div>
  `).join('') || '<p class="muted">Nenhum aviso cadastrado.</p>';
}

function renderEsf() {
  $('#listaEsf').innerHTML = esfUnidades.map(([nome, desc]) => `<div class="unit-item"><strong>${nome}</strong><p class="muted">${desc}</p></div>`).join('');
}

function exportarCsv() {
  const linhas = [['Nome', 'Celular', 'Email', 'Perfil', 'Ativo', 'Cadastro']];
  state.usuarios.forEach((u) => linhas.push([
    u.nomeCompleto || '', u.celular || '', u.email || '', u.isAdminGeral ? 'ADM Geral' : 'Usuário', u.ativo ? 'Sim' : 'Não', formatDate(u.criadoEm)
  ]));
  const csv = linhas.map((linha) => linha.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(';')).join('\n');
  const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `relatorio-usuarios-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

async function salvarPermissoesUsuario(uid) {
  if (!isAdminGeral()) return toast('Somente o ADM geral pode alterar permissões.');
  const usuario = state.usuarios.find((u) => u.id === uid);
  if (!usuario?.isAdminGeral && uid === state.firebaseUser.uid) return toast('Não altere suas permissões por aqui.');
  const permissoes = { ...permissoesPadrao };
  $$(`input[data-user="${uid}"][data-perm]`).forEach((input) => permissoes[input.dataset.perm] = input.checked);
  const virouAdmin = Object.values(permissoes).some(Boolean);
  await updateDoc(doc(db, 'usuarios', uid), {
    permissoes,
    role: virouAdmin ? 'admin' : 'usuario',
    isAdminGeral: usuario?.isAdminGeral === true
  });
  toast('Permissões atualizadas.');
}

async function alternarAtivo(uid) {
  if (!isAdminGeral()) return toast('Somente o ADM geral pode bloquear usuários.');
  if (uid === state.firebaseUser.uid) return toast('Você não pode bloquear sua própria conta.');
  const usuario = state.usuarios.find((u) => u.id === uid);
  await updateDoc(doc(db, 'usuarios', uid), { ativo: !usuario.ativo });
  toast(usuario.ativo ? 'Usuário bloqueado.' : 'Usuário ativado.');
}

function configurarEventos() {
  $$('.auth-tab').forEach((tab) => tab.addEventListener('click', () => {
    $$('.auth-tab').forEach((b) => b.classList.remove('active'));
    tab.classList.add('active');
    $('#loginForm').classList.toggle('hidden', tab.dataset.authTab !== 'login');
    $('#cadastroForm').classList.toggle('hidden', tab.dataset.authTab !== 'cadastro');
  }));

  $$('[data-toggle-password]').forEach((btn) => btn.addEventListener('click', () => {
    const input = document.getElementById(btn.dataset.togglePassword);
    input.type = input.type === 'password' ? 'text' : 'password';
    btn.textContent = input.type === 'password' ? 'Ver' : 'Ocultar';
  }));

  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await signInWithEmailAndPassword(auth, $('#loginEmail').value, $('#loginSenha').value);
    } catch (error) { toast('Erro no login: ' + traduzErro(error.code)); }
  });

  $('#cadastroForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if ($('#cadSenha').value !== $('#cadSenha2').value) return toast('As senhas não conferem.');
    try {
      const cred = await createUserWithEmailAndPassword(auth, $('#cadEmail').value, $('#cadSenha').value);
      await updateProfile(cred.user, { displayName: $('#cadNome').value });
      await garantirUsuario(cred.user, { nomeCompleto: $('#cadNome').value, celular: $('#cadCelular').value });
      toast('Conta criada com sucesso.');
    } catch (error) { toast('Erro ao criar conta: ' + traduzErro(error.code)); }
  });

  $('#btnGoogle').addEventListener('click', async () => {
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      await garantirUsuario(cred.user);
    } catch (error) { toast('Erro no Google: ' + traduzErro(error.code)); }
  });

  $('#btnResetSenha').addEventListener('click', async () => {
    const email = prompt('Digite seu e-mail para receber a recuperação de senha:');
    if (!email) return;
    try { await sendPasswordResetEmail(auth, email); toast('E-mail de recuperação enviado.'); }
    catch (error) { toast('Erro ao enviar recuperação: ' + traduzErro(error.code)); }
  });

  $('#completeProfileForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    await updateDoc(doc(db, 'usuarios', state.firebaseUser.uid), {
      nomeCompleto: $('#completeNome').value,
      celular: onlyNumbers($('#completeCelular').value),
      cadastroCompleto: true
    });
    state.perfil = await garantirUsuario(state.firebaseUser);
    $('#completeProfileModal').classList.add('hidden');
    abrirApp();
    toast('Cadastro completo.');
  });

  $('#btnLogout').addEventListener('click', () => signOut(auth));
  $('#btnMobileMenu').addEventListener('click', () => $('.sidebar').classList.toggle('open'));
  $$('.menu-item').forEach((btn) => btn.addEventListener('click', () => abrirPagina(btn.dataset.page)));
  $$('[data-open]').forEach((btn) => btn.addEventListener('click', () => abrirPagina(btn.dataset.open)));

  $$('[data-triagem]').forEach((btn) => btn.addEventListener('click', () => {
    const result = $('#triagemResult');
    result.classList.remove('hidden');
    result.innerHTML = btn.dataset.triagem === 'upa'
      ? '<h3>Vá para a UPA</h3><p>Procure atendimento de urgência imediatamente.</p>'
      : '<h3>Vá ao Posto de Saúde</h3><p>Procure a unidade do seu bairro para atendimento programado.</p>';
  }));

  $('#btnFilaMais').addEventListener('click', () => { state.fila += 1; atualizarFila(); });
  $('#btnFilaMenos').addEventListener('click', () => { state.fila = Math.max(0, state.fila - 1); atualizarFila(); });

  $('#agendamentoForm').addEventListener('submit', (e) => { e.preventDefault(); toast('Solicitação registrada visualmente. Podemos ligar ao Firestore na próxima etapa.'); e.target.reset(); });
  $('#avisoForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!temPermissao('avisos')) return toast('Sem permissão.');
    await setDoc(doc(collection(db, 'avisos')), { mensagem: $('#avisoMensagem').value, criadoEm: serverTimestamp(), autorUid: state.firebaseUser.uid });
    $('#avisoMensagem').value = '';
    toast('Aviso salvo.');
  });

  $('#relatorioBusca').addEventListener('input', renderRelatorios);
  $('#usuariosBusca').addEventListener('input', renderUsuarios);
  $('#btnExportCsv').addEventListener('click', exportarCsv);

  document.addEventListener('click', (e) => {
    const save = e.target.closest('[data-save-user]');
    const toggle = e.target.closest('[data-toggle-active]');
    if (save) salvarPermissoesUsuario(save.dataset.saveUser);
    if (toggle) alternarAtivo(toggle.dataset.toggleActive);
  });

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    state.deferredPrompt = e;
    $('#btnInstall').classList.remove('hidden');
  });

  $('#btnInstall').addEventListener('click', async () => {
    if (!state.deferredPrompt) return toast('Quando o navegador liberar, a instalação aparecerá automaticamente.');
    state.deferredPrompt.prompt();
    await state.deferredPrompt.userChoice;
    state.deferredPrompt = null;
  });

  $('#btnNotify').addEventListener('click', async () => {
    if (!('Notification' in window)) return toast('Este navegador não suporta notificações.');
    const result = await Notification.requestPermission();
    toast(result === 'granted' ? 'Notificações ativadas.' : 'Notificações não autorizadas.');
  });
}

function atualizarFila() {
  $('#filaAtual').textContent = String(state.fila).padStart(2, '0');
  $('#esperaEstimada').textContent = `~${state.fila * 5} min`;
}

function traduzErro(code) {
  const mapa = {
    'auth/invalid-email': 'e-mail inválido.',
    'auth/user-not-found': 'usuário não encontrado.',
    'auth/wrong-password': 'senha incorreta.',
    'auth/invalid-credential': 'e-mail ou senha incorretos.',
    'auth/email-already-in-use': 'este e-mail já está cadastrado.',
    'auth/weak-password': 'a senha precisa ter pelo menos 6 caracteres.',
    'auth/popup-closed-by-user': 'login cancelado.',
    'permission-denied': 'sem permissão no Firebase.'
  };
  return mapa[code] || code || 'erro desconhecido.';
}

configurarEventos();
atualizarFila();

onAuthStateChanged(auth, async (user) => {
  if (user) {
    try { await carregarPerfil(user); }
    catch (error) { toast('Erro ao carregar perfil: ' + traduzErro(error.code)); }
  } else {
    fecharApp();
  }
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./firebase-messaging-sw.js').catch(() => null));
}
