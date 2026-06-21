const admin = require("firebase-admin");

// Inicializar Firebase Admin usando las credenciales por defecto de la aplicación
// Si estás logueado en la terminal con firebase CLI, admin.initializeApp() puede resolver las credenciales automáticamente
// en entornos locales si se configuran adecuadamente, o usando la cuenta de servicio.
admin.initializeApp({
  projectId: "aplicacioncinemark"
});

const email = "cinemarkproyecto@equipo.local";

async function makeAdmin() {
  try {
    console.log(`Buscando usuario con email: ${email}...`);
    const user = await admin.auth().getUserByEmail(email);
    console.log(`Usuario encontrado! UID: ${user.uid}`);

    console.log("Configurando claims de administrador...");
    await admin.auth().setCustomUserClaims(user.uid, {
      role: "admin",
      admin: true
    });

    console.log("¡Claims de admin configurados exitosamente!");
    console.log("Nota: El usuario debe cerrar sesión y volver a ingresar en la app para actualizar su token.");
    process.exit(0);
  } catch (error) {
    console.error("Error al configurar admin claims:", error);
    process.exit(1);
  }
}

makeAdmin();
