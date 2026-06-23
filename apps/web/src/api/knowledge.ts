import { apiDelete, apiGet, apiPatch, apiPost } from "./http";

type MutationOptions = { toast?: boolean };

export function getCompanyProfile<T = unknown>() {
  return apiGet<T>("/knowledge/company-profile");
}

export function updateCompanyProfile<T = unknown>(payload: unknown, options?: MutationOptions) {
  return apiPatch<T>("/knowledge/company-profile", payload, options);
}

export function getBrands<T = unknown>() {
  return apiGet<T>("/knowledge/brands");
}

export function createBrand<T = unknown>(payload: unknown, options?: MutationOptions) {
  return apiPost<T>("/knowledge/brands", payload, options);
}

export function updateBrand<T = unknown>(id: string, payload: unknown, options?: MutationOptions) {
  return apiPatch<T>(`/knowledge/brands/${id}`, payload, options);
}

export function deleteBrand<T = unknown>(id: string, options?: MutationOptions) {
  return apiDelete<T>(`/knowledge/brands/${id}`, options);
}

export function getProducts<T = unknown>() {
  return apiGet<T>("/knowledge/products");
}

export function createProduct<T = unknown>(payload: unknown, options?: MutationOptions) {
  return apiPost<T>("/knowledge/products", payload, options);
}

export function updateProduct<T = unknown>(id: string, payload: unknown, options?: MutationOptions) {
  return apiPatch<T>(`/knowledge/products/${id}`, payload, options);
}

export function deleteProduct<T = unknown>(id: string, options?: MutationOptions) {
  return apiDelete<T>(`/knowledge/products/${id}`, options);
}

export function getOemCapabilities<T = unknown>() {
  return apiGet<T>("/knowledge/oem-capabilities");
}

export function createOemCapability<T = unknown>(payload: unknown, options?: MutationOptions) {
  return apiPost<T>("/knowledge/oem-capabilities", payload, options);
}

export function updateOemCapability<T = unknown>(id: string, payload: unknown, options?: MutationOptions) {
  return apiPatch<T>(`/knowledge/oem-capabilities/${id}`, payload, options);
}

export function deleteOemCapability<T = unknown>(id: string, options?: MutationOptions) {
  return apiDelete<T>(`/knowledge/oem-capabilities/${id}`, options);
}

export function getCertificates<T = unknown>() {
  return apiGet<T>("/knowledge/certificates");
}

export function createCertificate<T = unknown>(payload: unknown, options?: MutationOptions) {
  return apiPost<T>("/knowledge/certificates", payload, options);
}

export function updateCertificate<T = unknown>(id: string, payload: unknown, options?: MutationOptions) {
  return apiPatch<T>(`/knowledge/certificates/${id}`, payload, options);
}

export function deleteCertificate<T = unknown>(id: string, options?: MutationOptions) {
  return apiDelete<T>(`/knowledge/certificates/${id}`, options);
}

export function getCaseStudies<T = unknown>() {
  return apiGet<T>("/knowledge/case-studies");
}

export function createCaseStudy<T = unknown>(payload: unknown, options?: MutationOptions) {
  return apiPost<T>("/knowledge/case-studies", payload, options);
}

export function updateCaseStudy<T = unknown>(id: string, payload: unknown, options?: MutationOptions) {
  return apiPatch<T>(`/knowledge/case-studies/${id}`, payload, options);
}

export function deleteCaseStudy<T = unknown>(id: string, options?: MutationOptions) {
  return apiDelete<T>(`/knowledge/case-studies/${id}`, options);
}

export function getEmailMaterials<T = unknown>() {
  return apiGet<T>("/knowledge/email-materials");
}

export function createEmailMaterial<T = unknown>(payload: unknown, options?: MutationOptions) {
  return apiPost<T>("/knowledge/email-materials", payload, options);
}

export function updateEmailMaterial<T = unknown>(id: string, payload: unknown, options?: MutationOptions) {
  return apiPatch<T>(`/knowledge/email-materials/${id}`, payload, options);
}

export function deleteEmailMaterial<T = unknown>(id: string, options?: MutationOptions) {
  return apiDelete<T>(`/knowledge/email-materials/${id}`, options);
}
