import {
  extractFunction,
  stripTrailingComment,
  stringLiterals,
} from "./extract-rules-lib";
import { careerFieldsSchema, type CareerFields } from "../lib/validation/adult";

/** carierfields.cpp owns the skill occurrences charged by wizard.cpp:3932–4038.
 * Keep duplicates: each occurrence costs 30 XP and earns a 6 XP rebate. */
export function extractCareerFields(
  read: (file: string) => string,
): CareerFields {
  const file = "carierfields.cpp";
  const source = read(file);
  const fields: CareerFields["fields"] = [];
  for (const [offset, raw] of source.split(/\r?\n/).entries()) {
    const code = stripTrailingComment(raw).trim();
    if (!code.startsWith("masterFieldList.insert")) continue;
    const match = /^masterFieldList\.insert\("([^"]+)",\s*"([^"]+)"\);$/.exec(
      code,
    );
    if (!match)
      throw new Error(`${file}:${offset + 1}: Unknown field insertion`);
    let field = fields.find((entry) => entry.name === match[1]);
    if (!field) {
      field = {
        name: match[1],
        skills: [],
        source: { file, line: offset + 1 },
      };
      fields.push(field);
    }
    field.skills.push(match[2]);
  }
  const fn = extractFunction(source, /CarierFields::FieldDialSearch\(/);
  const choices: CareerFields["choices"] = [];
  let current: CareerFields["choices"][number] | null = null;
  for (const raw of fn.lines) {
    const code = stripTrailingComment(raw).trim();
    const match = /^if \(nameAny\.contains\("([^"]+)"\) == true\) \{$/.exec(
      code,
    );
    if (match) {
      current = { match: match[1], candidates: [] };
      choices.push(current);
    } else if (code.startsWith("listAnySkills <<")) {
      if (!current || !/^listAnySkills(?:\s*<<\s*"[^"]+")+;$/.test(code))
        throw new Error(`${file}: Unknown field choice list: ${code}`);
      current.candidates.push(...stringLiterals(code));
    } else if (
      code &&
      !/^(QStringList |return listAnySkills;|[{}])/.test(code)
    ) {
      throw new Error(`${file}: Unknown field dialog statement: ${code}`);
    }
  }
  return careerFieldsSchema.parse({ fields, choices });
}
