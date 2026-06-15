/**
 * The LLM prompt and CSV template for path 2 (CSV import).
 * Shown in-app (ImportSheet "How to make this CSV" expander + copy button)
 * and mirrored in docs/import-csv.md for auditing.
 */

export const CSV_COLUMNS = "roaster,name,origin,region,varietal,process,roast,roasted_at,grams,notes";

export const CSV_EXAMPLE =
  "Five Senses,Ethiopia Kochere,Ethiopia,Yirgacheffe,Heirloom,Washed,light,2025-10-01,250,cherry;jasmine;chocolate";

/**
 * The prompt to copy-paste into ChatGPT / Claude.
 * Paste this in full, then describe your coffee list below it (or paste a table).
 */
export const IMPORT_PROMPT = `Convert my coffee list into a CSV with these exact columns (one header row, then data rows — no extra text):

${CSV_COLUMNS}

Rules:
- roast must be one of: light, medium-light, medium, medium-dark, dark
- roasted_at must be YYYY-MM-DD (e.g. 2025-10-01). Use today's date if unknown.
- grams is the bag weight in grams (e.g. 250). Use 250 if unknown.
- notes is a semicolon-separated list of tasting descriptors (e.g. cherry;chocolate;caramel). Leave blank if none.
- region is the growing region within the country (e.g. Yirgacheffe). Leave blank if not known.
- varietal is the coffee variety (e.g. Bourbon, Heirloom). Leave blank if not known.
- process is the processing method (e.g. Washed, Natural, Honey). Leave blank if not known.
- Leave any unknown field blank — do not make things up.
- Do not add extra columns or quotes around fields unless the field contains a comma.

Example row:
${CSV_EXAMPLE}

My coffees:
`;
