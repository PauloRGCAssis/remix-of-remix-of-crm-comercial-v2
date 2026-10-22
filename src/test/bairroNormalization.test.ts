import { describe, it, expect } from 'vitest';
import { normalizeBairro, matchBairroRegional } from '@/lib/bairroNormalization';

describe('normalizeBairro', () => {
  it('removes accents/diacritics', () => {
    expect(normalizeBairro('Funcionários')).toBe('FUNCIONARIOS');
    expect(normalizeBairro('São José')).toBe('SAO JOSE');
    expect(normalizeBairro('Savassi')).toBe('SAVASSI');
  });

  it('converts to uppercase', () => {
    expect(normalizeBairro('centro')).toBe('CENTRO');
  });

  it('trims and collapses spaces', () => {
    expect(normalizeBairro('  Santa   Efigênia  ')).toBe('SANTA EFIGENIA');
  });

  it('removes punctuation', () => {
    expect(normalizeBairro('Olhos d\'Água')).toBe('OLHOS DAGUA');
  });

  it('replaces hyphens with spaces', () => {
    expect(normalizeBairro('Caiçara-Adelaide')).toBe('CAICARA ADELAIDE');
  });

  it('expands common abbreviations', () => {
    expect(normalizeBairro('Jd Montanhês')).toBe('JARDIM MONTANHES');
    expect(normalizeBairro('Sta Efigênia')).toBe('SANTA EFIGENIA');
    expect(normalizeBairro('Sto Agostinho')).toBe('SANTO AGOSTINHO');
    expect(normalizeBairro('Vl Paris')).toBe('VILA PARIS');
  });

  it('handles empty and whitespace input', () => {
    expect(normalizeBairro('')).toBe('');
    expect(normalizeBairro('   ')).toBe('');
  });
});

describe('matchBairroRegional', () => {
  it('exact match: finds single regional (AUTO_OK)', () => {
    const result = matchBairroRegional('Savassi');
    expect(result.regional_status).toBe('AUTO_OK');
    expect(result.regional).toBe('Centro-Sul');
    expect(result.regional_confianca).toBe(1.0);
  });

  it('exact match with accents: same result as without', () => {
    const r1 = matchBairroRegional('Funcionários');
    const r2 = matchBairroRegional('Funcionarios');
    expect(r1.regional_status).toBe(r2.regional_status);
    expect(r1.regional).toBe(r2.regional);
    expect(r1.regional).toBe('Centro-Sul');
  });

  it('exact match with abbreviation: "Jd Montanhês" expands to "Jardim Montanhês"', () => {
    const result = matchBairroRegional('Jd Montanhês');
    expect(result.regional_status).toBe('AUTO_OK');
    expect(result.regional).toBe('Noroeste');
  });

  it('Floresta is Centro-Sul', () => {
    const result = matchBairroRegional('Floresta');
    expect(result.regional_status).toBe('AUTO_OK');
    expect(result.regional).toBe('Centro-Sul');
  });

  it('Santa Efigênia is Centro-Sul', () => {
    const result = matchBairroRegional('Santa Efigênia');
    expect(result.regional_status).toBe('AUTO_OK');
    expect(result.regional).toBe('Centro-Sul');
  });

  it('Lagoinha is Noroeste', () => {
    const result = matchBairroRegional('Lagoinha');
    expect(result.regional_status).toBe('AUTO_OK');
    expect(result.regional).toBe('Noroeste');
  });

  it('non-existent bairro: returns AUTO_NAO_ENCONTRADO', () => {
    const result = matchBairroRegional('Bairro Inexistente XYZ');
    expect(result.regional_status).toBe('AUTO_NAO_ENCONTRADO');
    expect(result.regional).toBeUndefined();
    expect(result.regional_confianca).toBe(0);
  });

  it('typo/misspelling: returns NAO_ENCONTRADO for very wrong input', () => {
    const result = matchBairroRegional('Xkvwzp');
    expect(result.regional_status).toBe('AUTO_NAO_ENCONTRADO');
  });

  it('empty input: returns NAO_ENCONTRADO', () => {
    const result = matchBairroRegional('');
    expect(result.regional_status).toBe('AUTO_NAO_ENCONTRADO');
  });

  it('regional source is always BH_BAIRROS_REGIONAIS', () => {
    const r1 = matchBairroRegional('Savassi');
    const r2 = matchBairroRegional('Bairro Inexistente');
    expect(r1.regional_fonte).toBe('BH_BAIRROS_REGIONAIS');
    expect(r2.regional_fonte).toBe('BH_BAIRROS_REGIONAIS');
  });

  it('finds Buritis as Oeste', () => {
    const result = matchBairroRegional('Buritis');
    expect(result.regional_status).toBe('AUTO_OK');
    expect(result.regional).toBe('Oeste');
  });

  it('finds Venda Nova as Venda Nova', () => {
    const result = matchBairroRegional('Venda Nova');
    expect(result.regional_status).toBe('AUTO_OK');
    expect(result.regional).toBe('Venda Nova');
  });

  it('finds Castelo as Pampulha', () => {
    const result = matchBairroRegional('Castelo');
    expect(result.regional_status).toBe('AUTO_OK');
    expect(result.regional).toBe('Pampulha');
  });

  it('Céu Azul is Venda Nova', () => {
    const result = matchBairroRegional('Céu Azul');
    expect(result.regional_status).toBe('AUTO_OK');
    expect(result.regional).toBe('Venda Nova');
  });

  it('finds Barreiro as Barreiro', () => {
    const result = matchBairroRegional('Barreiro');
    expect(result.regional_status).toBe('AUTO_OK');
    expect(result.regional).toBe('Barreiro');
  });

  it('finds Aarão Reis as Norte', () => {
    const result = matchBairroRegional('Aarão Reis');
    expect(result.regional_status).toBe('AUTO_OK');
    expect(result.regional).toBe('Norte');
  });

  it('finds Zilah Spósito as Norte', () => {
    const result = matchBairroRegional('Zilah Spósito');
    expect(result.regional_status).toBe('AUTO_OK');
    expect(result.regional).toBe('Norte');
  });
});
