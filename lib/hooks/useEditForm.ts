"use client";
import { useState, useCallback } from "react";

/**
 * Shared edit-form state for detail sheets: an `editing` flag, a draft `form`
 * snapshot, and a curried field setter. Save logic stays with the caller —
 * this only owns the draft lifecycle.
 *
 *   const { editing, form, startEdit, cancelEdit, set } = useEditForm<EditForm>();
 *   startEdit({ ...snapshotOfCurrentValues });
 *   <Field value={form.name} onChange={set("name")} />
 */
export function useEditForm<T extends object>() {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<T | null>(null);

  const startEdit = useCallback((initial: T) => {
    setForm(initial);
    setEditing(true);
  }, []);

  const cancelEdit = useCallback(() => setEditing(false), []);

  const set = useCallback(<K extends keyof T>(k: K) => (v: T[K]) =>
    setForm((f) => (f ? { ...f, [k]: v } : f)), []);

  return { editing, form, setForm, startEdit, cancelEdit, set, setEditing };
}
