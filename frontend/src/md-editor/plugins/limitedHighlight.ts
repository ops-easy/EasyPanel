import type { BytemdPlugin } from "bytemd";
import type hljsType from "highlight.js";

type HighlightJsApi = typeof hljsType;
type LanguageModule = { default: Parameters<HighlightJsApi["registerLanguage"]>[1] };

let hljsPromise: Promise<HighlightJsApi> | null = null;

async function loadHighlight(): Promise<HighlightJsApi> {
  if (!hljsPromise) {
    hljsPromise = (async () => {
      const { default: hljs } = (await import("highlight.js/lib/core")) as unknown as { default: HighlightJsApi };
      const [
        { default: bash },
        { default: diff },
        { default: go },
        { default: javascript },
        { default: json },
        { default: markdown },
        { default: nginx },
        { default: typescript },
        { default: xml },
        { default: yaml },
      ] = (await Promise.all([
        import("highlight.js/lib/languages/bash"),
        import("highlight.js/lib/languages/diff"),
        import("highlight.js/lib/languages/go"),
        import("highlight.js/lib/languages/javascript"),
        import("highlight.js/lib/languages/json"),
        import("highlight.js/lib/languages/markdown"),
        import("highlight.js/lib/languages/nginx"),
        import("highlight.js/lib/languages/typescript"),
        import("highlight.js/lib/languages/xml"),
        import("highlight.js/lib/languages/yaml"),
      ])) as LanguageModule[];

      const languages = {
        bash,
        diff,
        go,
        javascript,
        json,
        markdown,
        nginx,
        typescript,
        xml,
        yaml,
      };

      Object.entries(languages).forEach(([name, language]) => {
        if (!hljs.getLanguage(name)) {
          hljs.registerLanguage(name, language);
        }
      });

      hljs.registerAliases(["sh", "shell"], { languageName: "bash" });
      hljs.registerAliases("js", { languageName: "javascript" });
      hljs.registerAliases("ts", { languageName: "typescript" });
      hljs.registerAliases(["yml", "yaml"], { languageName: "yaml" });
      hljs.configure({ languages: Object.keys(languages) });

      return hljs;
    })();
  }

  return hljsPromise;
}

export function limitedHighlight(): BytemdPlugin {
  return {
    viewerEffect({ markdownBody }) {
      const codeBlocks = Array.from(markdownBody.querySelectorAll<HTMLElement>("pre > code"));
      if (codeBlocks.length === 0) {
        return;
      }

      let cancelled = false;

      void loadHighlight().then((hljs) => {
        if (cancelled) {
          return;
        }

        codeBlocks.forEach((codeBlock) => {
          hljs.highlightElement(codeBlock);
        });
      });

      return () => {
        cancelled = true;
      };
    },
  };
}
