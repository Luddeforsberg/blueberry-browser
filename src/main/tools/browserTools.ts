import type { PageTarget } from "./pageTarget";
import type { PageTool } from "./pageTool";
import { toolContext, type PageToolAccess } from "./toolContext";
import { readingTools } from "./readingTools";
import { pointerTools } from "./pointerTools";
import { typingTools } from "./typingTools";
import { askingTools } from "./askingTools";
import { tabTools } from "./tabTools";
import { fetchPageTool, webSearchTool } from "./webTools";
import { withLimits } from "./mascotLimits";

export type { PageTool } from "./pageTool";
export type { PageToolAccess } from "./toolContext";
export { siteOf } from "./askFirst";
export { showsFrameOffLimits } from "./mascotLimits";
export { HANDOFF_WORDS } from "./handoffWords";

// What Berry can do in the browser, put together from each kind of tool. The order is the one the model sees.
export const createPageTools = <T extends PageTarget>(access: PageToolAccess<T>): PageTool[] => {
  // Every part of `access` is read once, here, in the order it always was, since a caller can hand over getters.
  const context = toolContext(access);
  const { search, fetchPage } = context;
  const reading = readingTools(context);
  const pointer = pointerTools(context);
  const typing = typingTools(context);
  const asking = askingTools(context);
  const tabs = tabTools(context);

  const tools = [
    reading.list_tabs,
    reading.read_page,
    reading.find_in_page,
    reading.list_elements,
    reading.scroll_page,
    pointer.click,
    pointer.double_click,
    pointer.hover,
    pointer.drag,
    typing.press_key,
    asking.wait,
    asking.ask_user,
    asking.hand_to_user,
    typing.type_text,
    pointer.choose_option,
    reading.screenshot,
    tabs.go_back,
    tabs.close_tab,
    tabs.go_to,
    tabs.open_tab,
    ...(search ? [webSearchTool(context, search)] : []),
    ...(fetchPage ? [fetchPageTool(context, fetchPage)] : []),
  ];

  return withLimits(context, tools);
};
