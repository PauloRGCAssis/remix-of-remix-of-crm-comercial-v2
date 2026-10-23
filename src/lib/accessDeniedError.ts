export class AccessDeniedError extends Error {
  constructor(public readonly reason: 'missing' | 'inactive') {
    super(reason === 'missing' ? 'Conta sem autorização para utilizar o CRM.' : 'Conta inativa. Contate o administrador.');
    this.name = 'AccessDeniedError';
  }
}
