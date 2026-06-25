# Regras atualizadas do Firestore

Depois de subir esta versão, cole estas regras em:

Firebase Console → Firestore Database → Regras → Publicar

```js
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    function logado() {
      return request.auth != null;
    }

    function usuarioExiste() {
      return logado()
        && exists(/databases/$(database)/documents/usuarios/$(request.auth.uid));
    }

    function meuUsuario() {
      return get(/databases/$(database)/documents/usuarios/$(request.auth.uid));
    }

    function usuarioAtivo() {
      return usuarioExiste()
        && meuUsuario().data.ativo == true;
    }

    function souAdminGeral() {
      return usuarioAtivo()
        && meuUsuario().data.isAdminGeral == true
        && meuUsuario().data.role == "admin_geral";
    }

    function temPermissao(permissao) {
      return usuarioAtivo()
        && (
          souAdminGeral() ||
          meuUsuario().data.permissoes[permissao] == true
        );
    }

    match /usuarios/{userId} {
      allow create: if logado() && request.auth.uid == userId;
      allow read: if usuarioAtivo() && (
        request.auth.uid == userId ||
        souAdminGeral() ||
        temPermissao("usuarios") ||
        temPermissao("relatorios")
      );
      allow update: if souAdminGeral();
      allow delete: if souAdminGeral();
    }

    match /avisos/{docId} {
      allow read: if usuarioAtivo();
      allow write: if temPermissao("avisos");
    }

    match /cursos/{docId} {
      allow read: if usuarioAtivo();
      allow write: if temPermissao("cetec");
    }

    match /inscricoes_cetec/{docId} {
      allow create: if usuarioAtivo()
        && request.resource.data.uid == request.auth.uid;
      allow read: if usuarioAtivo() && (
        resource.data.uid == request.auth.uid ||
        temPermissao("cetec") ||
        temPermissao("relatorios")
      );
      allow update, delete: if temPermissao("cetec");
    }

    match /agendamentos/{docId} {
      allow create: if usuarioAtivo()
        && request.resource.data.uid == request.auth.uid;
      allow read: if usuarioAtivo() && (
        resource.data.uid == request.auth.uid ||
        temPermissao("agendamentos") ||
        temPermissao("relatorios")
      );
      allow update: if usuarioAtivo() && (
        temPermissao("agendamentos") ||
        resource.data.uid == request.auth.uid
      );
      allow delete: if temPermissao("agendamentos");
    }

    match /upa/{docId} {
      allow read: if usuarioAtivo();
      allow write: if temPermissao("upa");
    }

    match /esf/{docId} {
      allow read: if usuarioAtivo();
      allow write: if temPermissao("esf");
    }

    match /laboratorio/{docId} {
      allow read: if usuarioAtivo();
      allow write: if temPermissao("laboratorio");
    }

    match /cetec/{docId} {
      allow read: if usuarioAtivo();
      allow write: if temPermissao("cetec");
    }

    match /denuncias/{docId} {
      allow create: if usuarioAtivo()
        && request.resource.data.uid == request.auth.uid;
      allow read, update, delete: if souAdminGeral();
    }

    match /relatorios/{docId} {
      allow read: if temPermissao("relatorios");
      allow write: if souAdminGeral();
    }

    match /escalas/{docId} {
      allow read: if usuarioAtivo();
      allow write: if temPermissao("escalas");
    }

    match /configuracoes/{docId} {
      allow read: if usuarioAtivo();
      allow write: if souAdminGeral();
    }

    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```
