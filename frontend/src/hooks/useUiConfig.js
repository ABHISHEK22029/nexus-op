import { useCallback } from 'react';
import { useUiConfigContext } from '../context/UiConfigContext';

/**
 * useUiConfig — read dynamic UI configuration from PostgreSQL
 *
 * Usage:
 *   const { label, get, isEnabled, options } = useUiConfig();
 *
 *   // Get a field label (falls back if not configured)
 *   <label>{label('vendor.form.gstin.label', 'GSTIN')}</label>
 *
 *   // Check a feature flag
 *   {isEnabled('feature.expenses') && <ExpensesLink />}
 *
 *   // Get dropdown options
 *   {options('vendor.form.type.options', []).map(o => <option .../>)}
 *
 *   // Get any config value
 *   const banner = get('dashboard.banner', { active: false });
 */
export function useUiConfig() {
  const { config } = useUiConfigContext();

  /** Get raw value for any config key */
  const get = useCallback((key, fallback) => {
    return config[key] ?? fallback;
  }, [config]);

  /** Get label text (for field_label config_type) */
  const label = useCallback((key, fallback) => {
    const val = config[key];
    if (!val) return fallback;
    return val.text ?? fallback;
  }, [config]);

  /** Get placeholder text */
  const placeholder = useCallback((key, fallback = '') => {
    const val = config[key];
    if (!val) return fallback;
    return val.text ?? fallback;
  }, [config]);

  /** Get hint/helper text */
  const hint = useCallback((key) => {
    const val = config[key];
    return val?.text ?? null;
  }, [config]);

  /** Check a feature flag is enabled */
  const isEnabled = useCallback((key) => {
    const val = config[key];
    if (!val) return false;
    return val.enabled === true || val.enabled === 'true';
  }, [config]);

  /** Check section/field is visible */
  const isVisible = useCallback((key, defaultVisible = true) => {
    const val = config[key];
    if (!val || val.visible === undefined) return defaultVisible;
    return val.visible === true || val.visible === 'true';
  }, [config]);

  /** Get dropdown options array */
  const options = useCallback((key, fallback = []) => {
    const val = config[key];
    return val?.options ?? fallback;
  }, [config]);

  /** Get button text */
  const buttonText = useCallback((key, fallback) => {
    const val = config[key];
    return val?.text ?? fallback;
  }, [config]);

  /** Get page title config */
  const pageTitle = useCallback((key, fallback) => {
    const val = config[key];
    return val ?? { title: fallback, subtitle: '' };
  }, [config]);

  /** Get image URL */
  const imageUrl = useCallback((key, fallback = '') => {
    const val = config[key];
    return val?.url ?? fallback;
  }, [config]);

  /** Get visible columns for a table */
  const tableColumns = useCallback((key, allColumns) => {
    const val = config[key];
    return val?.visible ?? allColumns;
  }, [config]);

  return {
    get,
    label,
    placeholder,
    hint,
    isEnabled,
    isVisible,
    options,
    buttonText,
    pageTitle,
    imageUrl,
    tableColumns,
    config, // raw access if needed
  };
}
