// Máscara de teléfono: solo dígitos (hasta 15), con + inicial opcional

export const formatTelefono = (value) => {
  const s = String(value);
  const plus = s.trimStart().startsWith('+') ? '+' : '';
  return plus + s.replace(/\D/g, '').slice(0, 15);
};
