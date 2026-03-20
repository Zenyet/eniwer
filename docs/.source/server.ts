// @ts-nocheck
import * as __fd_glob_9 from "../content/docs/plugin-api/plugin-interface.mdx?collection=docs"
import * as __fd_glob_8 from "../content/docs/plugin-api/plugin-context.mdx?collection=docs"
import * as __fd_glob_7 from "../content/docs/plugin-api/events.mdx?collection=docs"
import * as __fd_glob_6 from "../content/docs/plugin-api/capabilities.mdx?collection=docs"
import * as __fd_glob_5 from "../content/docs/guides/settings-plugin.mdx?collection=docs"
import * as __fd_glob_4 from "../content/docs/guides/getting-started.mdx?collection=docs"
import * as __fd_glob_3 from "../content/docs/index.mdx?collection=docs"
import { default as __fd_glob_2 } from "../content/docs/plugin-api/meta.json?collection=docs"
import { default as __fd_glob_1 } from "../content/docs/guides/meta.json?collection=docs"
import { default as __fd_glob_0 } from "../content/docs/meta.json?collection=docs"
import { server } from 'fumadocs-mdx/runtime/server';
import type * as Config from '../source.config';

const create = server<typeof Config, import("fumadocs-mdx/runtime/types").InternalTypeConfig & {
  DocData: {
  }
}>({"doc":{"passthroughs":["extractedReferences"]}});

export const docs = await create.docs("docs", "content/docs", {"meta.json": __fd_glob_0, "guides/meta.json": __fd_glob_1, "plugin-api/meta.json": __fd_glob_2, }, {"index.mdx": __fd_glob_3, "guides/getting-started.mdx": __fd_glob_4, "guides/settings-plugin.mdx": __fd_glob_5, "plugin-api/capabilities.mdx": __fd_glob_6, "plugin-api/events.mdx": __fd_glob_7, "plugin-api/plugin-context.mdx": __fd_glob_8, "plugin-api/plugin-interface.mdx": __fd_glob_9, });