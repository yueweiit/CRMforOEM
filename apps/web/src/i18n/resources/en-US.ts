export const enUS = {
  common: {
    appName: "Customer Development CRM",
    appTagline: "Foreign trade development loop",
    cancel: "Cancel",
    save: "Save",
    view: "View",
    viewEmail: "View email",
    language: "Language",
    loading: "Loading..."
  },
  nav: {
    dashboard: "Dashboard",
    customers: "Customers",
    emailCenter: "Email center",
    followUps: "Follow-ups",
    knowledge: "Company knowledge",
    reports: "Reports",
    settings: "Settings"
  },
  auth: {
    email: "Email",
    password: "Password",
    login: "Log in",
    loggingIn: "Logging in...",
    loginFailed: "Login failed. Please check your email and password."
  },
  toast: {
    processing: "Processing",
    uploading: "Uploading",
    loadingCreate: "Submitting data. Please wait.",
    loadingUpdate: "Saving changes. Please wait.",
    loadingDelete: "Deleting data. Please wait.",
    loadingUpload: "Uploading file. Please wait.",
    successCreateTitle: "Success",
    successUpdateTitle: "Saved",
    successDeleteTitle: "Deleted",
    successUploadTitle: "Uploaded",
    successCreate: "Operation completed.",
    successUpdate: "Changes saved.",
    successDelete: "Deleted successfully.",
    successUpload: "Uploaded successfully.",
    errorCreate: "Submission failed.",
    errorUpdate: "Save failed.",
    errorDelete: "Delete failed.",
    errorUpload: "Upload failed.",
    clientSuccessTitle: "success"
  },
  events: {
    taskGenerated: "New follow-up task generated",
    requirementTask: "A requirement confirmation task was created after the customer replied.",
    sampleTask: "A sample follow-up task was created. Please confirm the sample test feedback.",
    quoteTask: "A quote follow-up task was created. Please confirm the customer's quote feedback.",
    secondFollowUpTask: "The first email was sent and a second follow-up task was created.",
    thirdFollowUpTask: "The second follow-up is overdue and a third follow-up task was created.",
    customTask: "A follow-up task was created. Please handle it in time.",
    inboundMailReceived: "Customer reply received"
  }
} as const;
