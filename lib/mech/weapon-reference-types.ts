export interface MechWeaponReference {
  id: string;
  aliases: string[];
  megaMekName: string;
  techBase: "IS" | "CL" | null;
  heat: number;
  damage: [number, number, number];
  ranges: [number, number, number, number];
  isCluster: boolean;
}

export type MechWeaponReferenceResult =
  | { status: "matched"; reference: MechWeaponReference }
  | { status: "ambiguous" }
  | { status: "unmatched" };
