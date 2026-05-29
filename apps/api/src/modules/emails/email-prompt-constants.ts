export const EMAIL_PROMPT_BASE =
  "Write in English. Keep it specific, concise, non-spammy, and based only on the provided evidence.";

export const EMAIL_PROMPT_RECIPIENT_HINT =
  "Address the email to the intendedRecipient provided in the context.";

export const EMAIL_PROMPT_TEMPLATES: Record<string, string[]> = {
  FIRST_OUTREACH: [
    "You are writing a first OEM/ODM outreach email.",
    "Introduce your company's OEM/ODM capabilities briefly and highlight why you are reaching out to this specific customer.",
    "Be warm, professional, and leave room for a follow-up conversation."
  ],
  SECOND_FOLLOW_UP: [
    "You are writing a second follow-up email after no reply to the first outreach.",
    "Reference the previous email gently. Do not sound pushy or automated.",
    "Offer a brief additional value point or ask a light question to re-engage."
  ],
  THIRD_FOLLOW_UP: [
    "You are writing a product-supplement follow-up email.",
    "The customer has not replied to previous emails, so offer more concrete product details, case studies, or collaboration angles.",
    "Keep the tone helpful and value-driven, not desperate."
  ],
  REQUIREMENT_CONFIRMATION: [
    "You are writing a requirement confirmation email after the customer has replied.",
    "Be concise, responsive, and focused on confirming their product or purchasing requirements.",
    "Ask targeted follow-up questions to move the conversation forward."
  ],
  QUOTE_FOLLOW_UP: [
    "You are following up on a quotation.",
    "Focus on confirming whether the customer received the quote, whether they have questions, and what the next steps are.",
    "Keep the tone business-like but not aggressive."
  ],
  SAMPLE_FOLLOW_UP: [
    "You are following up on product samples or testing progress.",
    "Ask about sample testing results, feedback, or any concerns the customer may have.",
    "Keep the tone collaborative and supportive."
  ],
  DEFAULT: [
    "Write a personalized English OEM/ODM outreach email."
  ]
};
