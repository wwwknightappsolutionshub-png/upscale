import type { EmailTemplate } from "@upscale/shared/email-templates";
import { EMAIL_MERGE_TAGS } from "@upscale/shared/email-templates";

function esc(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function registrationEmailEditorPage(template: EmailTemplate) {
  const tags = EMAIL_MERGE_TAGS.map(
    (t) =>
      `<button type="button" class="tag-btn" data-tag="${esc(t.key)}" title="${esc(t.label)}">{{${esc(t.key)}}}</button>`,
  ).join("");

  return `
    <div class="email-editor">
      <div class="panel">
        <form method="post" action="/admin/emails/registration" class="stack" id="email-form">
          <label class="full">
            Subject line
            <input name="subject" id="email-subject" value="${esc(template.subject)}" required maxlength="200" />
            <span class="hint">Use merge tags like {{referenceCode}}.</span>
          </label>

          <div class="email-editor-split">
            <div>
              <div class="email-editor-toolbar">
                <h2>HTML body</h2>
                <p class="hint">Rich editor for the email your registrants receive. Inline styles are preserved for mail clients.</p>
              </div>
              <textarea name="html" id="email-html" class="email-html-source">${esc(template.html)}</textarea>
            </div>
            <aside class="email-side">
              <h3>Merge tags</h3>
              <p class="hint">Click to insert at the cursor in the subject or HTML body.</p>
              <div class="merge-tags">${tags}</div>
              <h3>Plain-text fallback</h3>
              <p class="hint">Sent to clients that do not render HTML. Leave blank to auto-generate from HTML.</p>
              <textarea name="text" id="email-text" rows="14" class="email-text-fallback">${esc(template.text)}</textarea>
            </aside>
          </div>

          <div class="email-actions">
            <button type="submit">Save template</button>
            <a class="ghost btn-link" href="/admin/emails/registration/preview" target="_blank" rel="noopener">Preview with sample data</a>
          </div>
        </form>
      </div>
    </div>
    <script src="https://cdn.jsdelivr.net/npm/tinymce@7.6.0/tinymce.min.js"></script>
    <script>
      (function () {
        const subject = document.getElementById("email-subject");
        const textArea = document.getElementById("email-text");
        const form = document.getElementById("email-form");

        function insertAtCursor(el, token) {
          if (!el) return;
          const start = el.selectionStart ?? el.value.length;
          const end = el.selectionEnd ?? el.value.length;
          const before = el.value.slice(0, start);
          const after = el.value.slice(end);
          el.value = before + token + after;
          const pos = start + token.length;
          el.selectionStart = el.selectionEnd = pos;
          el.focus();
        }

        document.querySelectorAll(".tag-btn").forEach((btn) => {
          btn.addEventListener("click", () => {
            const key = btn.getAttribute("data-tag");
            const token = "{{" + key + "}}";
            const editor = window.tinymce && tinymce.get("email-html");
            if (editor && editor.hasFocus()) {
              editor.insertContent(token);
              return;
            }
            if (document.activeElement === textArea) {
              insertAtCursor(textArea, token);
              return;
            }
            if (document.activeElement === subject) {
              insertAtCursor(subject, token);
              return;
            }
            if (editor) {
              editor.insertContent(token);
              editor.focus();
            } else {
              insertAtCursor(subject, token);
            }
          });
        });

        tinymce.init({
          selector: "#email-html",
          height: 520,
          menubar: false,
          branding: false,
          promotion: false,
          license_key: "gpl",
          plugins: "link lists code table autoresize",
          toolbar: "undo redo | blocks | bold italic underline | alignleft aligncenter alignright | bullist numlist | link table | code",
          content_style: "body { font-family: system-ui, sans-serif; font-size: 14px; line-height: 1.5; color: #111; }",
          valid_elements: "*[*]",
          extended_valid_elements: "*[*]",
          convert_urls: false,
        });

        form.addEventListener("submit", () => {
          const editor = tinymce.get("email-html");
          if (editor) editor.save();
        });
      })();
    </script>
  `;
}
