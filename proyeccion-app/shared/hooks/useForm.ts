/**
 * Hook genérico para manejar formularios con validación
 * Simplifica el manejo de estado y validación de formularios
 */

import { useState } from "react";

export type ValidationRule = {
  validate: (value: any) => boolean;
  message: string;
};

export type FormValidation<T> = {
  [K in keyof T]?: ValidationRule[];
};

export interface UseFormOptions<T> {
  initialValues: T;
  validation?: FormValidation<T>;
  onSubmit?: (values: T) => void | Promise<void>;
}

export interface UseFormResult<T> {
  values: T;
  errors: Partial<Record<keyof T, string>>;
  touched: Partial<Record<keyof T, boolean>>;
  isSubmitting: boolean;
  setValue: <K extends keyof T>(field: K, value: T[K]) => void;
  setValues: (values: Partial<T>) => void;
  setError: (field: keyof T, message: string) => void;
  clearError: (field: keyof T) => void;
  clearErrors: () => void;
  touch: (field: keyof T) => void;
  reset: () => void;
  validate: () => boolean;
  handleSubmit: () => Promise<void>;
}

/**
 * Hook para manejar formularios con validación
 * 
 * @example
 * ```typescript
 * const form = useForm({
 *   initialValues: {
 *     pelicula: "",
 *     sala: "",
 *   },
 *   validation: {
 *     pelicula: [
 *       { validate: (v) => v.trim().length > 0, message: "Película requerida" }
 *     ],
 *     sala: [
 *       { validate: (v) => v.trim().length > 0, message: "Sala requerida" }
 *     ],
 *   },
 *   onSubmit: async (values) => {
 *     await createEvento(values);
 *   },
 * });
 * 
 * // En el componente
 * <TextInput
 *   value={form.values.pelicula}
 *   onChangeText={(v) => form.setValue("pelicula", v)}
 *   onBlur={() => form.touch("pelicula")}
 * />
 * {form.touched.pelicula && form.errors.pelicula && (
 *   <Text>{form.errors.pelicula}</Text>
 * )}
 * 
 * <Button onPress={form.handleSubmit} disabled={form.isSubmitting} />
 * ```
 */
export function useForm<T extends Record<string, any>>(
  options: UseFormOptions<T>
): UseFormResult<T> {
  const { initialValues, validation = {} as FormValidation<T>, onSubmit } = options;

  const [values, setValuesState] = useState<T>(initialValues);
  const [errors, setErrors] = useState<Partial<Record<keyof T, string>>>({});
  const [touched, setTouched] = useState<Partial<Record<keyof T, boolean>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const setValue = <K extends keyof T>(field: K, value: T[K]) => {
    setValuesState((prev) => ({ ...prev, [field]: value }));
    
    // Validar el campo si tiene reglas de validación
    const fieldRules = validation ? (validation as any)[field] : undefined;
    if (fieldRules && Array.isArray(fieldRules)) {
      for (const rule of fieldRules) {
        if (!rule.validate(value)) {
          setErrors((prev) => ({ ...prev, [field]: rule.message }));
          return;
        }
      }
      // Si pasa todas las validaciones, limpiar error
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const setValues = (newValues: Partial<T>) => {
    setValuesState((prev) => ({ ...prev, ...newValues }));
  };

  const setError = (field: keyof T, message: string) => {
    setErrors((prev) => ({ ...prev, [field]: message }));
  };

  const clearError = (field: keyof T) => {
    setErrors((prev) => {
      const newErrors = { ...prev };
      delete newErrors[field];
      return newErrors;
    });
  };

  const clearErrors = () => {
    setErrors({});
  };

  const touch = (field: keyof T) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  };

  const reset = () => {
    setValuesState(initialValues);
    setErrors({});
    setTouched({});
    setIsSubmitting(false);
  };

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof T, string>> = {};
    let isValid = true;

    // Validar todos los campos que tienen reglas
    if (validation) {
      for (const field in validation) {
        const fieldKey = field as keyof T;
        const rules = validation[fieldKey];
        if (rules && Array.isArray(rules)) {
          const value = values[fieldKey];
          for (const rule of rules) {
            if (!rule.validate(value)) {
              newErrors[fieldKey] = rule.message;
              isValid = false;
              break;
            }
          }
        }
      }
    }

    setErrors(newErrors);
    return isValid;
  };

  const handleSubmit = async () => {
    // Marcar todos los campos como touched
    const allTouched: Partial<Record<keyof T, boolean>> = {};
    for (const field in values) {
      allTouched[field as keyof T] = true;
    }
    setTouched(allTouched);

    // Validar
    if (!validate()) {
      return;
    }

    // Ejecutar onSubmit si existe
    if (onSubmit) {
      setIsSubmitting(true);
      try {
        await onSubmit(values);
      } catch (error) {
        console.error("Form submission error:", error);
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  return {
    values,
    errors,
    touched,
    isSubmitting,
    setValue,
    setValues,
    setError,
    clearError,
    clearErrors,
    touch,
    reset,
    validate,
    handleSubmit,
  };
}
