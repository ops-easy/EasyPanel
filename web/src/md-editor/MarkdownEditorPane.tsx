import { Editor } from "@bytemd/react";
import breaks from "@bytemd/plugin-breaks";
import frontmatter from "@bytemd/plugin-frontmatter";
import gfm from "@bytemd/plugin-gfm";
import math from "@bytemd/plugin-math";
import mermaid from "@bytemd/plugin-mermaid";
import zhHans from "bytemd/locales/zh_Hans.json";
import { limitedHighlight } from "./plugins/limitedHighlight";
import "bytemd/dist/index.css";
import "github-markdown-css/github-markdown-light.css";
import "highlight.js/styles/xcode.css";
import "katex/dist/katex.min.css";

const plugins = [gfm(), limitedHighlight(), math(), breaks(), frontmatter(), mermaid()];

type MarkdownEditorPaneProps = {
  value: string;
  onChange: (content: string) => void;
  uploadImages: (files: File[]) => Promise<{ url: string; alt?: string; title?: string }[]>;
};

export function MarkdownEditorPane({ value, onChange, uploadImages }: MarkdownEditorPaneProps) {
  return (
    <Editor
      value={value}
      plugins={plugins}
      locale={zhHans}
      onChange={onChange}
      mode="split"
      placeholder="开始编写你的 Markdown 文档..."
      uploadImages={uploadImages}
      editorConfig={{ lineNumbers: true }}
    />
  );
}
