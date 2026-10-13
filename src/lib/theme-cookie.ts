import { cache } from "react";
import { cookies } from "next/headers";
import { parseTheme, THEME_COOKIE } from "./theme-preference";

export const readTheme = cache(async () => parseTheme((await cookies()).get(THEME_COOKIE)?.value));
