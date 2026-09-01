export function textareaValue(value: string) {
  return value.replaceAll("</textarea>", "&lt;/textarea&gt;");
}

type RichField = {
  id: string;
  height?: number;
};

export function richEditorBoot(fields: RichField[], formIds: string[] = []) {
  const inits = fields
    .map(
      (field) => `tinymce.init({
        selector: "#${field.id}",
        height: ${field.height ?? 280},
        menubar: false,
        branding: false,
        promotion: false,
        license_key: "gpl",
        plugins: "link lists autoresize",
        toolbar:
          "undo redo | blocks | bold italic underline | alignleft aligncenter alignright alignjustify | bullist numlist | link | removeformat",
        content_style:
          'body { font-family: system-ui, sans-serif; font-size: 14px; line-height: 1.55; color: #111; max-width: 52rem; }',
        convert_urls: false,
      })`,
    )
    .join(";\n        ");

  const formHooks = formIds
    .map(
      (id) => `document.getElementById(${JSON.stringify(id)})?.addEventListener("submit", () => {
          if (window.tinymce) tinymce.triggerSave();
        });`,
    )
    .join("\n        ");

  return `
    <script src="https://cdn.jsdelivr.net/npm/tinymce@7.6.0/tinymce.min.js"></script>
    <script>
      (function () {
        ${inits};
        ${formHooks}
      })();
    </script>
  `;
}
