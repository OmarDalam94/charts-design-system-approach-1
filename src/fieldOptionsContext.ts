import { createContext } from "react";
import { fieldOptionsFor } from "./mockDataset";

export type FieldOption = ReturnType<typeof fieldOptionsFor>[number];

/** Column choices for mapping fields. The Builder uses the mock dataset; the Chart Lab supplies its fixture columns. */
export const FieldOptionsContext = createContext<(fieldName: string) => FieldOption[]>((name) => fieldOptionsFor(name));
