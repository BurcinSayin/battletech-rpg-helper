import type { Stage0Grant, Stage0Source } from "../lib/rules/stage0-contract";
import { stringLiterals } from "./extract-rules-lib";
import { Stage0SourceError, type Statement } from "./stage0-source";

const listName = /^(allSkills|allTraits|subAffList|listLang|primLang|secLang|affElem[12]|subAffElem[1-4](?:More)?|comElem|swpList)$/;
const textName = /^(affProtocol|affStreet|toolTipAff|ower_Affil|subAffElem[1-4]Label(?:More)?)$/;
const numberName = /^(xpCostModule|elem[12]XP(?:Attr|Skills|Traits)|aff(?:Skills|Traits|Attr)Elem[1-4](?:More)?|comElemInt|countElem[12]|countFMAttr|subCountElem[1-4])$/;

export class Stage0Statements {
  readonly lists = new Map<string, string[]>();
  readonly texts = new Map<string, string>();
  readonly numbers = new Map<string, number>();
  readonly sources = new Map<string, Stage0Source>();
  readonly attrs: Record<string, number> = {};
  readonly preAttrs: Record<string, number> = {};
  readonly skills: Stage0Grant[] = [];
  readonly traits: Stage0Grant[] = [];

  constructor(readonly subskills: Readonly<Record<string, readonly string[]>>) {}

  consume(statement: Statement): void {
    const { code, source } = statement;
    const fail = () => { throw new Stage0SourceError(source, code); };
    if (/^QString(?:List)? (swpstr|swpList);$/.test(code)) return;
    const clear = /^(\w+)\.clear\(\);$/.exec(code);
    if (clear) {
      const key = clear[1];
      if (listName.test(key)) this.lists.set(key, []);
      else if (textName.test(key)) this.texts.set(key, "");
      else {
        switch (key) {
          case "affAttr": case "affAttrCast": for (const k of Object.keys(this.attrs)) delete this.attrs[k]; break;
          case "s0PreAttr": for (const k of Object.keys(this.preAttrs)) delete this.preAttrs[k]; break;
          case "affSkills": case "affSkillsCast": this.skills.length = 0; break;
          case "affTraits": case "affTraitsCast": this.traits.length = 0; break;
          case "s0PreSkills": case "s0PreTraits": break;
          default: fail();
        }
      }
      return;
    }
    const grant = /^addSub(Skills|Traits)(?:Cast)?\("((?:[^"\\]|\\.)*)"\s*,\s*([+-]?\d+)\);$/.exec(code);
    if (grant) {
      const value = { name: stringLiterals(code)[0], xp: Number(grant[3]) };
      (grant[1] === "Skills" ? this.skills : this.traits).push(value);
      return;
    }
    const attr = /^(affAttr(?:Cast)?|s0PreAttr)\["(STR|BOD|RFL|DEX|INT|WIL|CHA|EDG)"\]\s*=\s*([+-]?\d+);$/.exec(code);
    if (attr) { (attr[1] === "s0PreAttr" ? this.preAttrs : this.attrs)[attr[2]] = Number(attr[3]); return; }
    const assignment = /^(\w+)\s*=\s*(.+);$/.exec(code);
    if (assignment) {
      const [, key, value] = assignment;
      this.sources.set(key, source);
      if (numberName.test(key) && /^[+-]?\d+$/.test(value)) { this.numbers.set(key, Number(value)); return; }
      if (textName.test(key) && /^"(?:[^"\\]|\\.)*"$/.test(value)) { this.texts.set(key, stringLiterals(value)[0]); return; }
      if (listName.test(key) && /^\w+(?:\s*\+\s*\w+)*$/.test(value)) {
        const names = value.split(/\s*\+\s*/);
        if (names.some((name) => !listName.test(name))) fail();
        this.lists.set(key, names.flatMap((name) => this.lists.get(name) ?? [])); return;
      }
      fail();
    }
    const list = /^(\w+)\s*((?:<<\s*"(?:[^"\\]|\\.)*"\s*)+);$/.exec(code);
    if (list && listName.test(list[1])) {
      this.sources.set(list[1], source);
      this.lists.set(list[1], [...(this.lists.get(list[1]) ?? []), ...stringLiterals(list[2])]); return;
    }
    const append = /^(\w+)\.append\(CreateSubSkillList\("([^"]+)"\)\);$/.exec(code);
    if (append && listName.test(append[1])) {
      const family = append[2];
      const subs = this.subskills[family];
      if (!subs) fail();
      this.sources.set(append[1], source);
      this.lists.set(append[1], [...(this.lists.get(append[1]) ?? []), ...subs.map((sub) => `${family}/${sub}`).sort()]);
      return;
    }
    fail();
  }
}
