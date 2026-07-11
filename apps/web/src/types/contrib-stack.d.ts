import type { HTMLAttributes } from "react";

export type ContribStackAttributes = HTMLAttributes<HTMLElement> & {
  user?: string;
  theme?: "light" | "dark" | "auto";
  range?: string;
  sources?: string;
  api?: string;
  link?: "on" | "off";
};

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "contrib-stack": ContribStackAttributes;
    }
  }
}
