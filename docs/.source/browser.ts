// @ts-nocheck
import { browser } from 'fumadocs-mdx/runtime/browser';
import type * as Config from '../source.config';

const create = browser<typeof Config, import("fumadocs-mdx/runtime/types").InternalTypeConfig & {
  DocData: {
  }
}>();
const browserCollections = {
  docs: create.doc("docs", {"index.mdx": () => import("../content/docs/index.mdx?collection=docs"), "guides/getting-started.mdx": () => import("../content/docs/guides/getting-started.mdx?collection=docs"), "guides/settings-plugin.mdx": () => import("../content/docs/guides/settings-plugin.mdx?collection=docs"), "plugin-api/capabilities.mdx": () => import("../content/docs/plugin-api/capabilities.mdx?collection=docs"), "plugin-api/events.mdx": () => import("../content/docs/plugin-api/events.mdx?collection=docs"), "plugin-api/plugin-context.mdx": () => import("../content/docs/plugin-api/plugin-context.mdx?collection=docs"), "plugin-api/plugin-interface.mdx": () => import("../content/docs/plugin-api/plugin-interface.mdx?collection=docs"), }),
};
export default browserCollections;