export const esES = {
  common: {
    appName: "CRM de desarrollo de clientes",
    appTagline: "Ciclo de desarrollo de comercio exterior",
    cancel: "Cancelar",
    save: "Guardar",
    view: "Ver",
    viewEmail: "Ver email",
    language: "Idioma",
    loading: "Cargando..."
  },
  nav: {
    dashboard: "Panel",
    customers: "Clientes",
    emailCenter: "Centro de emails",
    followUps: "Seguimientos",
    knowledge: "Base de empresa",
    reports: "Informes",
    settings: "Configuracion"
  },
  auth: {
    email: "Email",
    password: "Contrasena",
    login: "Iniciar sesion",
    loggingIn: "Iniciando sesion...",
    loginFailed: "Error de inicio de sesion. Revisa el email y la contrasena."
  },
  toast: {
    processing: "Procesando",
    uploading: "Subiendo",
    loadingCreate: "Enviando datos. Espera un momento.",
    loadingUpdate: "Guardando cambios. Espera un momento.",
    loadingDelete: "Eliminando datos. Espera un momento.",
    loadingUpload: "Subiendo archivo. Espera un momento.",
    successCreateTitle: "Operacion completada",
    successUpdateTitle: "Guardado",
    successDeleteTitle: "Eliminado",
    successUploadTitle: "Subido",
    successCreate: "Operacion completada.",
    successUpdate: "Cambios guardados.",
    successDelete: "Eliminado correctamente.",
    successUpload: "Subido correctamente.",
    errorCreate: "Error al enviar.",
    errorUpdate: "Error al guardar.",
    errorDelete: "Error al eliminar.",
    errorUpload: "Error al subir.",
    clientSuccessTitle: "success"
  },
  events: {
    taskGenerated: "Nueva tarea de seguimiento generada",
    requirementTask: "Se creo una tarea de confirmacion de requisitos tras la respuesta del cliente.",
    sampleTask: "Se creo una tarea de seguimiento de muestra. Confirma los comentarios de prueba.",
    quoteTask: "Se creo una tarea de seguimiento de cotizacion. Confirma la respuesta del cliente.",
    secondFollowUpTask: "Se envio el primer email y se creo una tarea de segundo seguimiento.",
    thirdFollowUpTask: "El segundo seguimiento vencio y se creo una tarea de tercer seguimiento.",
    customTask: "Se creo una tarea de seguimiento. Gestionela a tiempo.",
    inboundMailReceived: "Respuesta del cliente recibida"
  }
} as const;
