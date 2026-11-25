// next.config.ts
//
// CAPCANA (verificata cu next build): deepagents 1.15.1 importa si partea de
// sandbox din langsmith, care incearca sa incarce pachetul optional "ws".
// Daca Next impacheteaza deepagents, build-ul cade cu «Module not found: ws».
// Il lasam in afara bundle-ului: Node il incarca direct din node_modules,
// la rulare, ca pe orice pachet. (In Lab 14 facusem la fel pentru sqlite.)

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["deepagents"],
};

export default nextConfig;
