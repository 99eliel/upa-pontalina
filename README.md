# ConecteBR - Pontalina Digital

Sistema PWA para centralizar serviços digitais, saúde, avisos e módulos administrativos da cidade.

## Recursos desta versão

- Login com e-mail/senha pelo Firebase Authentication.
- Login com conta Google.
- Cadastro com nome completo e celular.
- Criação automática do usuário na coleção `usuarios`.
- Controle de acesso por permissões.
- ADM geral com acesso total.
- Gestão de usuários para liberar permissões por módulo.
- Relatório de usuários cadastrados.
- Exportação CSV dos usuários.
- Layout responsivo para celular.
- PWA preparado para GitHub Pages.

## Arquivos principais

- `index.html`: estrutura do aplicativo.
- `style.css`: visual e responsividade.
- `app.js`: lógica de login, cadastro, painel, relatórios e permissões.
- `firebase.js`: configuração do Firebase.
- `manifest.json`: configuração PWA.
- `firebase-messaging-sw.js`: service worker/cache/notificações.

## Publicação no GitHub Pages

Suba todos os arquivos na raiz do repositório e publique pela branch `main`.

URL esperada:

```txt
https://99eliel.github.io/upa-pontalina/
```

## Firebase necessário

1. Authentication com Google e e-mail/senha ativados.
2. Domínio autorizado: `99eliel.github.io`.
3. Firestore com coleção `usuarios`.
4. Seu documento de usuário com `isAdminGeral: true` e `role: "admin_geral"`.
5. Regras do Firestore já publicadas.

## Observação

Se o projeto Firebase usado for outro, altere os dados dentro do arquivo `firebase.js` e também dentro do `firebase-messaging-sw.js`.
