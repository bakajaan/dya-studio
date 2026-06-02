/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ABYSS_CLIENT_ID?: string;
  readonly VITE_ABYSS_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "*.svg?react" {
  import React from "react";
  const SVGComponent: React.FC<React.SVGProps<SVGSVGElement>>;
  export default SVGComponent;
}
