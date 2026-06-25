import {
  auth, db, googleProvider,
  signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendPasswordResetEmail, updateProfile, onAuthStateChanged, signOut,
  doc, getDoc, setDoc, updateDoc, collection, addDoc, query, where, orderBy, onSnapshot, serverTimestamp
} from './firebase.js';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const state = {
  firebaseUser: null,
  perfil: null,
  usuarios: [],
  avisos: [],
  cursos: [],
  inscricoes: [],
  agendamentos: [],
  upaStatus: {
    fila: 0,
    salaVermelha: true,
    plantaoClinico: 'A confirmar',
    plantaoPediatra: 'A confirmar',
    escala: {}
  },
  esfEscalas: {},
  deferredPrompt: null,
  pageStack: [],
  currentPage: 'dashboard',
  unsubs: []
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

const paginaPermissao = {
  avisos: 'avisos',
  relatorios: 'relatorios',
  usuarios: 'usuarios'
};

const diasSemana = [
  ['segunda', 'Segunda-feira'],
  ['terca', 'Terça-feira'],
  ['quarta', 'Quarta-feira'],
  ['quinta', 'Quinta-feira'],
  ['sexta', 'Sexta-feira'],
  ['sabado', 'Sábado'],
  ['domingo', 'Domingo']
];

const esfUnidades = [
  ['ESF 201 - Rural', 'Atendimento conforme escala da unidade.'],
  ['ESF 301 - Jardim Frei Walter', 'Atendimento de rotina e acompanhamento familiar.'],
  ['ESF 302 - Santa Rita de Cássia', 'Atendimento de rotina e acompanhamento familiar.'],
  ['ESF 303 - Dr. Antônio Carlos', 'Atendimento de rotina e acompanhamento familiar.'],
  ['ESF 304 - Lázaro Teodoro', 'Atendimento de rotina e acompanhamento familiar.'],
  ['ESF 305 - Aluísio Borges', 'Atendimento de rotina e acompanhamento familiar.']
];

const cursosPadrao = [
  { id: 'padrao_informatica_basica', nome: 'Informática Básica', descricao: 'Curso introdutório de informática.' },
  { id: 'padrao_excel_basico', nome: 'Excel Básico', descricao: 'Planilhas, fórmulas e organização de dados.' },
  { id: 'padrao_word_basico', nome: 'Word Básico', descricao: 'Documentos, formatação e digitação.' }
];

function toast(message) {
  const el = $('#toast');
  if (!el) return alert(message);
  el.textContent = message;
  el.classList.remove('hidden');
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => el.classList.add('hidden'), 3800);
}

function esc(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[char]));
}

function formatDate(value) {
  if (!value) return '-';
  const date = value.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = value.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function onlyNumbers(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizeId(value) {
  return onlyNumbers(value) || String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase();
}

function isAdminGeral() {
  return state.perfil?.isAdminGeral === true && state.perfil?.role === 'admin_geral';
}

function temPermissao(nome) {
  return isAdminGeral() || state.perfil?.permissoes?.[nome] === true;
}

function appEstaInstalado() {
  return window.matchMedia?.('(display-mode: standalone)').matches
    || window.navigator.standalone === true
    || localStorage.getItem('appInstalado') === '1';
}

function atualizarBotaoInstalar() {
  const btn = $('#btnInstall');
  if (!btn) return;
  if (appEstaInstalado()) {
    btn.classList.add('hidden');
    return;
  }
  if (state.deferredPrompt) btn.classList.remove('hidden');
  else btn.classList.add('hidden');
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
  limparListeners();
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

function limparListeners() {
  state.unsubs.forEach((unsub) => {
    try { unsub(); } catch (_) { /* vazio */ }
  });
  state.unsubs = [];
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
  $('#userRole').textContent = isAdminGeral() ? 'ADM Geral' : (Object.values(state.perfil.permissoes || {}).some(Boolean) ? 'ADM' : 'Usuário');
  aplicarPermissoesNaTela();
  aplicarEstadoNotificacao();
  atualizarBotaoInstalar();
  iniciarListenersFirebase();
  abrirPagina(state.currentPage || 'dashboard', { replace: true });
}

function fecharApp() {
  limparListeners();
  $('#authScreen').classList.remove('hidden');
  $('#appShell').classList.add('hidden');
  state.firebaseUser = null;
  state.perfil = null;
  state.pageStack = [];
  state.currentPage = 'dashboard';
}

function aplicarPermissoesNaTela() {
  $$('.admin-only').forEach((el) => el.classList.add('hidden'));
  Object.keys(permissoesPadrao).forEach((perm) => {
    if (temPermissao(perm)) {
      $$(`.perm-${perm}`).forEach((el) => el.classList.remove('hidden'));
    }
  });
}

function abrirPagina(id, options = {}) {
  const page = document.getElementById(id);
  if (!page) return;
  const perm = paginaPermissao[id];
  if (perm && !temPermissao(perm)) {
    toast('Você não tem permissão para acessar essa área.');
    id = 'dashboard';
  }
  if (!options.replace && state.currentPage && state.currentPage !== id) {
    state.pageStack.push(state.currentPage);
  }
  state.currentPage = id;
  $$('.page').forEach((p) => p.classList.remove('active'));
  $$('.menu-item').forEach((b) => b.classList.remove('active'));
  const finalPage = document.getElementById(id);
  finalPage.classList.add('active');
  const btn = $(`.menu-item[data-page="${id}"]`);
  if (btn) btn.classList.add('active');
  $('#pageTitle').textContent = btn?.textContent || finalPage.querySelector('h2')?.textContent || 'ConecteBR';
  $('#pageSubtitle').textContent = id === 'dashboard' ? 'Serviços digitais de Pontalina' : 'ConecteBR';
  const isHome = id === 'dashboard';
  $('#btnBack')?.classList.toggle('hidden', isHome);
  $('#btnHome')?.classList.toggle('hidden', isHome);
  $('.sidebar')?.classList.remove('open');
  $('#btnBack').disabled = state.pageStack.length === 0;
}

function voltarPagina() {
  const anterior = state.pageStack.pop();
  if (anterior) abrirPagina(anterior, { replace: true });
  else abrirPagina('dashboard', { replace: true });
}

function iniciarListenersFirebase() {
  escutarAvisos();
  escutarCursos();
  escutarInscricoes();
  escutarAgendamentos();
  escutarUpaStatus();
  escutarEsfEscalas();
  if (temPermissao('relatorios') || temPermissao('usuarios')) escutarUsuarios();
}

function escutarUsuarios() {
  const q = query(collection(db, 'usuarios'), orderBy('criadoEm', 'desc'));
  const unsub = onSnapshot(q, (snap) => {
    state.usuarios = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderRelatorios();
    renderUsuarios();
  }, (error) => toast('Erro ao carregar usuários: ' + traduzErro(error.code || error.message)));
  state.unsubs.push(unsub);
}

function escutarAvisos() {
  const q = query(collection(db, 'avisos'), orderBy('criadoEm', 'desc'));
  const unsub = onSnapshot(q, (snap) => {
    state.avisos = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderAvisos();
    renderAvisoDestaque();
    mostrarPopupAvisoSeNecessario();
  }, (error) => console.warn('Avisos:', error));
  state.unsubs.push(unsub);
}

function escutarCursos() {
  const q = query(collection(db, 'cursos'), orderBy('criadoEm', 'desc'));
  const unsub = onSnapshot(q, (snap) => {
    const firestoreCursos = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    state.cursos = [...firestoreCursos, ...cursosPadrao.filter((padrao) => !firestoreCursos.some((c) => c.nome === padrao.nome))];
    renderCursos();
  }, () => {
    state.cursos = [...cursosPadrao];
    renderCursos();
  });
  state.unsubs.push(unsub);
}

function escutarInscricoes() {
  const base = collection(db, 'inscricoes_cetec');
  const q = temPermissao('cetec') || temPermissao('relatorios')
    ? query(base, orderBy('criadoEm', 'desc'))
    : query(base, where('uid', '==', state.firebaseUser.uid));
  const unsub = onSnapshot(q, (snap) => {
    state.inscricoes = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    state.inscricoes.sort((a, b) => (b.criadoEm?.seconds || 0) - (a.criadoEm?.seconds || 0));
    renderInscricoes();
    renderRelatorios();
  }, (error) => console.warn('Inscrições:', error));
  state.unsubs.push(unsub);
}

function escutarAgendamentos() {
  const base = collection(db, 'agendamentos');
  const q = temPermissao('agendamentos') || temPermissao('relatorios')
    ? query(base, orderBy('criadoEm', 'desc'))
    : query(base, where('uid', '==', state.firebaseUser.uid));
  const unsub = onSnapshot(q, (snap) => {
    state.agendamentos = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    state.agendamentos.sort((a, b) => (b.criadoEm?.seconds || 0) - (a.criadoEm?.seconds || 0));
    renderAgendamentos();
    renderRelatorios();
  }, (error) => console.warn('Agendamentos:', error));
  state.unsubs.push(unsub);
}

function escutarUpaStatus() {
  const unsub = onSnapshot(doc(db, 'upa', 'status'), (snap) => {
    if (snap.exists()) state.upaStatus = { ...state.upaStatus, ...snap.data() };
    renderUpa();
  }, () => renderUpa());
  state.unsubs.push(unsub);
}

function escutarEsfEscalas() {
  const unsub = onSnapshot(collection(db, 'esf'), (snap) => {
    state.esfEscalas = {};
    snap.docs.forEach((d) => { state.esfEscalas[d.id] = d.data(); });
    renderEsf();
  }, () => renderEsf());
  state.unsubs.push(unsub);
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
  $('#statAgendamentos').textContent = state.agendamentos.length;
  $('#statInscricoes').textContent = state.inscricoes.length;
  $('#relatorioTabela').innerHTML = usuarios.map((u) => `
    <tr>
      <td>${esc(u.nomeCompleto || '-')}</td><td>${esc(u.celular || '-')}</td><td>${esc(u.email || '-')}</td>
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
      <label class="check"><input type="checkbox" data-user="${esc(u.id)}" data-perm="${perm}" ${u.permissoes?.[perm] ? 'checked' : ''} ${disabled}> ${perm}</label>
    `).join('');
    return `
      <div class="user-item">
        <div class="user-row">
          <div><strong>${esc(u.nomeCompleto || 'Sem nome')}</strong><br><span class="muted small">${esc(u.email || '-')} • ${esc(u.celular || '-')}</span></div>
          <div class="actions">
            <button class="ghost" data-save-user="${esc(u.id)}" ${disabled}>Salvar</button>
            <button class="${u.ativo ? 'danger-outline' : 'primary'}" data-toggle-active="${esc(u.id)}" ${disabled}>${u.ativo ? 'Bloquear' : 'Ativar'}</button>
          </div>
        </div>
        <div class="perm-grid">${perms}</div>
      </div>
    `;
  }).join('') || '<p class="muted">Nenhum usuário encontrado.</p>';
}

function renderAvisos() {
  const alvo = $('#listaAvisos');
  if (alvo) {
    alvo.innerHTML = state.avisos.map((a) => `
      <div class="notice-item">
        ${a.imagemData ? `<img class="notice-thumb" src="${a.imagemData}" alt="Cartaz do aviso" />` : ''}
        <div><strong>${esc(a.titulo || 'Aviso')}</strong><p>${esc(a.mensagem || '-')}</p><span class="muted small">${formatDateTime(a.criadoEm)} • ${a.ativo === false ? 'desligado' : 'ligado'}</span></div>
      </div>
    `).join('') || '<p class="muted">Nenhum aviso cadastrado.</p>';
  }
}

function renderAvisoDestaque() {
  const alvo = $('#avisoDestaque');
  if (!alvo) return;
  const aviso = state.avisos.find((a) => a.ativo !== false);
  if (!aviso) {
    alvo.classList.add('hidden');
    alvo.innerHTML = '';
    return;
  }
  alvo.classList.remove('hidden');
  alvo.innerHTML = `
    <div>
      <p class="eyebrow dark">Central de Avisos</p>
      <h2>${esc(aviso.titulo || 'Aviso importante')}</h2>
      <p>${esc(aviso.mensagem || '')}</p>
      <span class="muted small">Publicado em ${formatDateTime(aviso.criadoEm)}</span>
    </div>
    ${aviso.imagemData ? `<button class="primary" data-show-aviso="${esc(aviso.id)}">Ver cartaz</button>` : ''}
  `;
}

function mostrarPopupAvisoSeNecessario() {
  const aviso = state.avisos.find((a) => a.ativo !== false && a.imagemData);
  if (!aviso) return;
  const visto = localStorage.getItem(`aviso_visto_${aviso.id}`);
  if (visto) return;
  abrirPopupAviso(aviso);
}

function abrirPopupAviso(aviso) {
  $('#popupAvisoTitulo').textContent = aviso.titulo || 'Aviso importante';
  $('#popupAvisoMensagem').textContent = aviso.mensagem || '';
  const img = $('#popupAvisoImagem');
  if (aviso.imagemData) {
    img.src = aviso.imagemData;
    img.classList.remove('hidden');
  } else {
    img.classList.add('hidden');
    img.removeAttribute('src');
  }
  $('#avisoPopup').dataset.avisoId = aviso.id;
  $('#avisoPopup').classList.remove('hidden');
}

function fecharPopupAviso() {
  const id = $('#avisoPopup').dataset.avisoId;
  if (id) localStorage.setItem(`aviso_visto_${id}`, '1');
  $('#avisoPopup').classList.add('hidden');
}

function renderCursos() {
  const select = $('#cursoSelect');
  if (!select) return;
  select.innerHTML = state.cursos.map((curso) => `<option value="${esc(curso.id)}">${esc(curso.nome)}${curso.descricao ? ` - ${esc(curso.descricao)}` : ''}</option>`).join('') || '<option value="">Nenhum curso disponível</option>';
}

function renderInscricoes() {
  const minhas = $('#minhasInscricoes');
  if (minhas) {
    const lista = state.inscricoes.filter((i) => i.uid === state.firebaseUser.uid || temPermissao('cetec'));
    minhas.innerHTML = lista.filter((i) => i.uid === state.firebaseUser.uid).map((i) => `
      <div class="notice-item"><div><strong>${esc(i.cursoNome)}</strong><br><span class="muted small">${formatDateTime(i.criadoEm)} • ${esc(i.status || 'inscrito')}</span></div></div>
    `).join('') || '<p class="muted">Você ainda não possui inscrições.</p>';
  }
  const admin = $('#listaInscritos');
  if (admin && temPermissao('cetec')) {
    admin.innerHTML = state.inscricoes.map((i) => `
      <div class="notice-item"><div><strong>${esc(i.nomeCompleto || '-')}</strong><p>${esc(i.cursoNome || '-')}</p><span class="muted small">${esc(i.email || '')} • ${esc(i.celular || '')} • ${formatDateTime(i.criadoEm)}</span></div></div>
    `).join('') || '<p class="muted">Nenhuma inscrição encontrada.</p>';
  }
}

function renderAgendamentos() {
  const meus = $('#meusAgendamentos');
  if (meus) {
    const lista = state.agendamentos.filter((a) => a.uid === state.firebaseUser.uid);
    meus.innerHTML = lista.map((a) => `
      <div class="notice-item"><div><strong>${esc(a.posto || '-')}</strong><p>${esc(a.motivo || '-')}</p><span class="muted small">${esc(a.status || 'pendente')} • ${formatDateTime(a.criadoEm)}</span></div>${a.status === 'pendente' ? `<button class="danger-outline" data-cancel-agendamento="${esc(a.id)}">Cancelar</button>` : ''}</div>
    `).join('') || '<p class="muted">Nenhuma solicitação feita.</p>';
  }
  const admin = $('#adminAgendamentos');
  if (admin && temPermissao('agendamentos')) {
    const filtro = $('#filtroAgendamentoPosto')?.value || '';
    const lista = state.agendamentos.filter((a) => !filtro || a.posto === filtro);
    admin.innerHTML = lista.map((a) => `
      <div class="notice-item"><div><strong>${esc(a.nomeCompleto || '-')}</strong><p>${esc(a.posto || '-')} • ${esc(a.motivo || '-')}</p><span class="muted small">${esc(a.celular || '')} • ${formatDateTime(a.criadoEm)} • ${esc(a.status || 'pendente')}</span></div><div class="actions"><button class="primary" data-status-agendamento="${esc(a.id)}" data-status="confirmado">Confirmar</button><button class="ghost" data-status-agendamento="${esc(a.id)}" data-status="concluido">Concluir</button></div></div>
    `).join('') || '<p class="muted">Nenhuma solicitação encontrada.</p>';
  }
}

function renderUpa() {
  const fila = Number(state.upaStatus.fila || 0);
  $('#filaAtual').textContent = String(fila).padStart(2, '0');
  $('#esperaEstimada').textContent = `~${fila * 5} min`;
  $('#plantaoClinico').textContent = state.upaStatus.plantaoClinico || 'A confirmar';
  $('#plantaoPediatra').textContent = state.upaStatus.plantaoPediatra || 'A confirmar';
  $('#plantaoClinicoInput').value = state.upaStatus.plantaoClinico || '';
  $('#plantaoPediatraInput').value = state.upaStatus.plantaoPediatra || '';
  const badge = $('#salaVermelhaBadge');
  if (state.upaStatus.salaVermelha === false) {
    badge.textContent = 'Sala vermelha ocupada';
    badge.className = 'badge red';
  } else {
    badge.textContent = 'Sala vermelha disponível';
    badge.className = 'badge green';
  }
  const escala = state.upaStatus.escala || {};
  $('#escalaSemana').innerHTML = diasSemana.map(([key, label]) => `<div class="week-day"><strong>${label}</strong><span>${esc(escala[key] || 'A confirmar')}</span></div>`).join('');
  diasSemana.forEach(([key, label]) => {
    const inputId = `escala${key[0].toUpperCase()}${key.slice(1)}`.replace('Terca','Terca');
    const input = document.getElementById(inputId);
    if (input) input.value = escala[key] || '';
  });
}

function renderEsf() {
  const alvo = $('#listaEsf');
  if (!alvo) return;
  alvo.innerHTML = esfUnidades.map(([nome, desc]) => {
    const id = normalizeId(nome);
    const escala = state.esfEscalas[id] || {};
    return `<div class="unit-item"><strong>${esc(nome)}</strong><p class="muted">${esc(desc)}</p><p><strong>Médico:</strong> ${esc(escala.medico || 'A confirmar')}</p><p><strong>Horário:</strong> ${esc(escala.horario || 'A confirmar')}</p></div>`;
  }).join('');
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
  if (usuario?.isAdminGeral && uid === state.firebaseUser.uid) return toast('Não altere seu ADM geral por aqui.');
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

async function imagemParaDataUrl(file) {
  if (!file) return '';
  if (!file.type.startsWith('image/')) throw new Error('Selecione uma imagem válida.');
  const img = await new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = URL.createObjectURL(file);
  });
  const max = 1200;
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  URL.revokeObjectURL(img.src);
  return canvas.toDataURL('image/jpeg', 0.76);
}

function aplicarEstadoNotificacao() {
  const box = $('#notificationBox');
  if (!box) return;
  if (!('Notification' in window)) {
    box.classList.add('hidden');
    return;
  }
  const jaDecidiu = Notification.permission === 'granted' || Notification.permission === 'denied';
  const ativo = localStorage.getItem('notificacoesAtivadas') === '1' || jaDecidiu;
  box.classList.toggle('hidden', ativo);
}

async function salvarUpaStatus(parcial) {
  if (!temPermissao('upa')) return toast('Sem permissão para alterar UPA.');
  await setDoc(doc(db, 'upa', 'status'), { ...parcial, atualizadoEm: serverTimestamp() }, { merge: true });
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
    try { await signInWithEmailAndPassword(auth, $('#loginEmail').value, $('#loginSenha').value); }
    catch (error) { toast('Erro no login: ' + traduzErro(error.code)); }
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
  $('#btnBack').addEventListener('click', voltarPagina);
  $('#btnHome').addEventListener('click', () => abrirPagina('dashboard'));
  $$('.menu-item').forEach((btn) => btn.addEventListener('click', () => abrirPagina(btn.dataset.page)));

  $('[data-triagem-next]').addEventListener('click', () => {
    $('#triagemPergunta1').classList.add('hidden');
    $('#triagemPergunta2').classList.remove('hidden');
  });
  $$('[data-triagem-final]').forEach((btn) => btn.addEventListener('click', () => {
    const result = $('#triagemResult');
    result.classList.remove('hidden');
    result.innerHTML = btn.dataset.triagemFinal === 'upa'
      ? '<h3>Vá para a UPA</h3><p>Procure atendimento de urgência imediatamente.</p><div class="actions"><button class="primary" data-open="upa">Ver Fila da UPA Agora</button><button class="ghost" data-refazer-triagem>Refazer</button></div>'
      : '<h3>Vá ao Posto de Saúde</h3><p>Procure a unidade do seu bairro para atendimento programado.</p><div class="actions"><button class="primary" data-open="esf">Ver Postos de Saúde</button><button class="ghost" data-refazer-triagem>Refazer</button></div>';
  }));

  $('#agendamentoForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await addDoc(collection(db, 'agendamentos'), {
        uid: state.firebaseUser.uid,
        nomeCompleto: state.perfil.nomeCompleto || '',
        celular: state.perfil.celular || '',
        email: state.perfil.email || state.firebaseUser.email || '',
        posto: $('#agendaPosto').value,
        motivo: $('#agendaMotivo').value,
        observacao: $('#agendaObs').value,
        status: 'pendente',
        criadoEm: serverTimestamp()
      });
      e.target.reset();
      toast('Solicitação enviada.');
    } catch (error) { toast('Erro ao solicitar: ' + traduzErro(error.code)); }
  });

  $('#avisoImagem').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    const preview = $('#avisoPreview');
    if (!file) return preview.classList.add('hidden');
    try {
      preview.src = await imagemParaDataUrl(file);
      preview.classList.remove('hidden');
    } catch (error) { toast(error.message); }
  });

  $('#btnLimparAvisoImagem').addEventListener('click', () => {
    $('#avisoImagem').value = '';
    $('#avisoPreview').removeAttribute('src');
    $('#avisoPreview').classList.add('hidden');
  });

  $('#avisoForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!temPermissao('avisos')) return toast('Sem permissão.');
    try {
      const file = $('#avisoImagem').files?.[0];
      const imagemData = file ? await imagemParaDataUrl(file) : '';
      await addDoc(collection(db, 'avisos'), {
        titulo: $('#avisoTitulo').value || 'Aviso importante',
        mensagem: $('#avisoMensagem').value,
        imagemData,
        ativo: true,
        criadoEm: serverTimestamp(),
        autorUid: state.firebaseUser.uid
      });
      e.target.reset();
      $('#avisoPreview').classList.add('hidden');
      toast('Aviso ligado.');
    } catch (error) { toast('Erro ao salvar aviso: ' + traduzErro(error.code || error.message)); }
  });

  $('#btnDesligarAvisos').addEventListener('click', async () => {
    if (!temPermissao('avisos')) return toast('Sem permissão.');
    const ativos = state.avisos.filter((a) => a.ativo !== false);
    await Promise.all(ativos.map((a) => updateDoc(doc(db, 'avisos', a.id), { ativo: false })));
    toast('Avisos desligados.');
  });

  $('#cursoInscricaoForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const curso = state.cursos.find((c) => c.id === $('#cursoSelect').value);
    if (!curso) return toast('Escolha um curso.');
    const id = `${state.firebaseUser.uid}_${normalizeId(curso.id)}`;
    try {
      await setDoc(doc(db, 'inscricoes_cetec', id), {
        uid: state.firebaseUser.uid,
        nomeCompleto: state.perfil.nomeCompleto || '',
        celular: state.perfil.celular || '',
        email: state.perfil.email || state.firebaseUser.email || '',
        cursoId: curso.id,
        cursoNome: curso.nome,
        status: 'inscrito',
        criadoEm: serverTimestamp()
      }, { merge: false });
      toast('Inscrição confirmada.');
    } catch (error) { toast('Erro na inscrição: ' + traduzErro(error.code)); }
  });

  $('#cursoForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!temPermissao('cetec')) return toast('Sem permissão.');
    await addDoc(collection(db, 'cursos'), {
      nome: $('#cursoNome').value,
      descricao: $('#cursoDescricao').value,
      ativo: true,
      criadoEm: serverTimestamp(),
      autorUid: state.firebaseUser.uid
    });
    e.target.reset();
    toast('Curso disponibilizado.');
  });

  $('#plantaoForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    await salvarUpaStatus({ plantaoClinico: $('#plantaoClinicoInput').value || 'A confirmar', plantaoPediatra: $('#plantaoPediatraInput').value || 'A confirmar' });
    toast('Plantão atualizado.');
  });

  $('#escalaForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const escala = {
      segunda: $('#escalaSegunda').value,
      terca: $('#escalaTerca').value,
      quarta: $('#escalaQuarta').value,
      quinta: $('#escalaQuinta').value,
      sexta: $('#escalaSexta').value,
      sabado: $('#escalaSabado').value,
      domingo: $('#escalaDomingo').value
    };
    await salvarUpaStatus({ escala });
    toast('Escala salva.');
  });

  $('#btnFilaMais').addEventListener('click', () => salvarUpaStatus({ fila: Number(state.upaStatus.fila || 0) + 1 }));
  $('#btnFilaMenos').addEventListener('click', () => salvarUpaStatus({ fila: Math.max(0, Number(state.upaStatus.fila || 0) - 1) }));
  $('#btnToggleSala').addEventListener('click', () => salvarUpaStatus({ salaVermelha: !(state.upaStatus.salaVermelha !== false) }));

  $('#esfForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!temPermissao('esf')) return toast('Sem permissão.');
    const unidade = $('#esfUnidade').value;
    await setDoc(doc(db, 'esf', normalizeId(unidade)), {
      unidade,
      medico: $('#esfMedico').value,
      horario: $('#esfHorario').value,
      atualizadoEm: serverTimestamp(),
      autorUid: state.firebaseUser.uid
    }, { merge: true });
    e.target.reset();
    toast('ESF atualizado.');
  });

  $('#denunciaForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    await addDoc(collection(db, 'denuncias'), {
      uid: state.firebaseUser.uid,
      nomeCompleto: state.perfil.nomeCompleto || '',
      celular: state.perfil.celular || '',
      texto: $('#denunciaTexto').value,
      status: 'enviado',
      criadoEm: serverTimestamp()
    });
    e.target.reset();
    toast('Denúncia enviada.');
  });

  $('#relatorioBusca').addEventListener('input', renderRelatorios);
  $('#usuariosBusca').addEventListener('input', renderUsuarios);
  $('#filtroAgendamentoPosto').addEventListener('change', renderAgendamentos);
  $('#btnExportCsv').addEventListener('click', exportarCsv);

  document.addEventListener('click', async (e) => {
    const open = e.target.closest('[data-open]');
    if (open) abrirPagina(open.dataset.open);
    const showAviso = e.target.closest('[data-show-aviso]');
    if (showAviso) {
      const aviso = state.avisos.find((a) => a.id === showAviso.dataset.showAviso);
      if (aviso) abrirPopupAviso(aviso);
    }
    const refazer = e.target.closest('[data-refazer-triagem]');
    if (refazer) {
      $('#triagemPergunta1').classList.remove('hidden');
      $('#triagemPergunta2').classList.add('hidden');
      $('#triagemResult').classList.add('hidden');
    }
    const save = e.target.closest('[data-save-user]');
    const toggle = e.target.closest('[data-toggle-active]');
    const cancelAgenda = e.target.closest('[data-cancel-agendamento]');
    const statusAgenda = e.target.closest('[data-status-agendamento]');
    if (save) salvarPermissoesUsuario(save.dataset.saveUser);
    if (toggle) alternarAtivo(toggle.dataset.toggleActive);
    if (cancelAgenda) updateDoc(doc(db, 'agendamentos', cancelAgenda.dataset.cancelAgendamento), { status: 'cancelado' });
    if (statusAgenda) updateDoc(doc(db, 'agendamentos', statusAgenda.dataset.statusAgendamento), { status: statusAgenda.dataset.status });
  });

  $('#btnFecharAvisoPopup').addEventListener('click', fecharPopupAviso);
  $('#btnEntendiAviso').addEventListener('click', fecharPopupAviso);

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    state.deferredPrompt = e;
    atualizarBotaoInstalar();
  });

  window.addEventListener('appinstalled', () => {
    localStorage.setItem('appInstalado', '1');
    state.deferredPrompt = null;
    atualizarBotaoInstalar();
  });

  window.matchMedia?.('(display-mode: standalone)').addEventListener?.('change', atualizarBotaoInstalar);

  $('#btnInstall').addEventListener('click', async () => {
    if (appEstaInstalado()) {
      atualizarBotaoInstalar();
      return;
    }
    if (!state.deferredPrompt) return toast('Quando o navegador liberar, a instalação aparecerá automaticamente.');
    state.deferredPrompt.prompt();
    const choice = await state.deferredPrompt.userChoice;
    if (choice?.outcome === 'accepted') localStorage.setItem('appInstalado', '1');
    state.deferredPrompt = null;
    atualizarBotaoInstalar();
  });

  $('#btnNotify').addEventListener('click', async () => {
    if (!('Notification' in window)) return toast('Este navegador não suporta notificações.');
    const result = await Notification.requestPermission();
    if (result === 'granted') {
      localStorage.setItem('notificacoesAtivadas', '1');
      aplicarEstadoNotificacao();
      toast('Notificações ativadas.');
    } else {
      aplicarEstadoNotificacao();
      toast('Notificações não autorizadas.');
    }
  });
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
    'permission-denied': 'sem permissão no Firebase.',
    'missing or insufficient permissions': 'sem permissão no Firebase.'
  };
  return mapa[code] || code || 'erro desconhecido.';
}

configurarEventos();

onAuthStateChanged(auth, async (user) => {
  if (user) {
    try { await carregarPerfil(user); }
    catch (error) { toast('Erro ao carregar perfil: ' + traduzErro(error.code || error.message)); }
  } else {
    fecharApp();
  }
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./firebase-messaging-sw.js').catch(() => null));
}
