// Máscara y validación de CUIT argentino: XX-XXXXXXXX-X (11 dígitos)

export const formatCuit = (value) => {
  const digits = String(value).replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 10) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  return `${digits.slice(0, 2)}-${digits.slice(2, 10)}-${digits.slice(10)}`;
};

export const isValidCuit = (value) => /^\d{2}-\d{8}-\d{1}$/.test(value || '');
