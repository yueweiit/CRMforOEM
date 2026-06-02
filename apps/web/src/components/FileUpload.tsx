import { useEffect, useState } from "react";
import { apiDelete, apiGet, apiGetBlob, apiUpload } from "../api/http";

type FileAssetMeta = {
  id: string;
  originalName: string;
  mimeType?: string | null;
  thumbnailKey?: string | null;
  sizeBytes?: number | null;
};

type SignedFileAsset = {
  id: string;
  url: string;
  originalName: string;
  mimeType?: string | null;
};

type FileUploadProps = {
  fileIds: string[];
  onChange: (ids: string[]) => void;
  entityType: string;
  entityId?: string;
  multiple?: boolean;
};

type FilePreviewItem = FileAssetMeta & {
  thumbUrl?: string;
  rawUrl?: string;
};

type PreviewState = {
  id: string;
  title: string;
  url: string;
  mimeType?: string | null;
  managed: boolean;
};

type ApiMode = "signed" | "rich";

export function FileUpload(props: FileUploadProps) {
  const [items, setItems] = useState<FilePreviewItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [apiMode, setApiMode] = useState<ApiMode>("signed");
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const imageItems = items.filter((item) => item.mimeType?.startsWith("image/"));
  const currentImageIndex = preview ? imageItems.findIndex((item) => item.id === preview.id) : -1;

  useEffect(() => {
    let cancelled = false;
    const objectUrls: string[] = [];

    async function load() {
      setMessage("");
      if (!props.fileIds.length) {
        setItems([]);
        return;
      }

      const loaded: FilePreviewItem[] = [];
      const staleIds: string[] = [];
      let resolvedMode: ApiMode = apiMode;

      for (const id of props.fileIds) {
        const result = await tryLoadFileItem(id, resolvedMode, objectUrls);
        if (result.item) {
          loaded.push(result.item);
          if (result.mode) {
            resolvedMode = result.mode;
          }
          continue;
        }
        if (result.stale) {
          staleIds.push(id);
          continue;
        }
        if (result.error) {
          throw result.error;
        }
      }

      if (cancelled) return;

      if (resolvedMode !== apiMode) {
        setApiMode(resolvedMode);
      }

      if (staleIds.length) {
        const nextIds = props.fileIds.filter((id) => !staleIds.includes(id));
        props.onChange(nextIds);
        setMessage(`已自动跳过 ${staleIds.length} 个失效附件，请保存表单以同步更新。`);
      }

      setItems(loaded);
    }

    void load().catch((error) => {
      if (!cancelled) {
        setMessage(error instanceof Error ? error.message : "加载文件失败");
      }
    });

    return () => {
      cancelled = true;
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [apiMode, props.fileIds, props.onChange]);

  async function handleSelect(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setMessage("");

    try {
      const selected = props.multiple ? Array.from(files) : [files[0]];
      const created = [...props.fileIds];

      for (const file of selected) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("entityType", props.entityType);
        if (props.entityId) {
          formData.append("entityId", props.entityId);
        }

        const result = await apiUpload<FileAssetMeta>("/upload", formData);
        if (!props.multiple) {
          created.splice(0, created.length, result.id);
        } else {
          created.push(result.id);
        }
      }

      props.onChange(Array.from(new Set(created)));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "上传失败");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(id: string) {
    setBusy(true);
    setMessage("");
    try {
      await apiDelete(`/upload/${id}`);
      props.onChange(props.fileIds.filter((item) => item !== id));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "删除失败");
    } finally {
      setBusy(false);
    }
  }

  async function openRaw(item: FilePreviewItem) {
    try {
      const source = item.rawUrl ? { url: item.rawUrl, managed: false } : await buildRawUrl(item.id);
      replacePreview({
        id: item.id,
        url: source.url,
        managed: source.managed,
        title: item.originalName,
        mimeType: item.mimeType
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `无法打开文件：${item.originalName}`);
    }
  }

  function closePreview() {
    releasePreview(preview);
    setPreview(null);
  }

  async function showPrevImage() {
    if (currentImageIndex < 0 || imageItems.length < 2) return;
    const nextIndex = currentImageIndex === 0 ? imageItems.length - 1 : currentImageIndex - 1;
    await openRaw(imageItems[nextIndex]);
  }

  async function showNextImage() {
    if (currentImageIndex < 0 || imageItems.length < 2) return;
    const nextIndex = currentImageIndex === imageItems.length - 1 ? 0 : currentImageIndex + 1;
    await openRaw(imageItems[nextIndex]);
  }

  return (
    <div className="file-upload">
      <div className="file-upload-toolbar">
        <label className="secondary-button file-upload-button">
          {busy ? "处理中..." : props.multiple ? "上传文件" : "上传文件/图片"}
          <input
            hidden
            multiple={props.multiple}
            type="file"
            accept="image/*,.pdf"
            onChange={(event) => {
              void handleSelect(event.target.files);
              event.currentTarget.value = "";
            }}
          />
        </label>
        {message ? <span className="file-upload-message">{message}</span> : null}
      </div>

      {items.length ? (
        <div className="file-upload-grid">
          {items.map((item) => (
            <div className="file-upload-card" key={item.id}>
              {item.thumbUrl ? (
                <button className="file-upload-thumb" onClick={() => void openRaw(item)} type="button">
                  <img alt={item.originalName} src={item.thumbUrl} />
                </button>
              ) : (
                <button className="file-upload-file" onClick={() => void openRaw(item)} type="button">
                  <strong>{item.originalName}</strong>
                  <span>{item.mimeType ?? "文件"}</span>
                </button>
              )}
              <div className="toolbar">
                <button className="secondary-button" onClick={() => void openRaw(item)} type="button">预览</button>
                <button className="secondary-button" disabled={busy} onClick={() => void handleRemove(item.id)} type="button">删除</button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state">暂无已上传文件。</div>
      )}

      {preview ? (
        <div className="file-preview-backdrop" onClick={closePreview} role="presentation">
          <div className="file-preview-dialog" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={preview.title}>
            <div className="file-preview-header">
              <strong>{preview.title}</strong>
              <div className="toolbar">
                <a className="secondary-button" href={preview.url} download={preview.title}>下载文件</a>
                <button className="secondary-button" onClick={closePreview} type="button">关闭</button>
              </div>
            </div>
            <div className="file-preview-body">
              {preview.mimeType?.startsWith("image/") ? (
                <div className="file-preview-image-shell">
                  {imageItems.length > 1 ? (
                    <button className="file-preview-nav prev" onClick={() => void showPrevImage()} type="button">上一张</button>
                  ) : null}
                  <img alt={preview.title} className="file-preview-image" src={preview.url} />
                  {imageItems.length > 1 ? (
                    <button className="file-preview-nav next" onClick={() => void showNextImage()} type="button">下一张</button>
                  ) : null}
                </div>
              ) : preview.mimeType === "application/pdf" ? (
                <div className="file-preview-pdf">
                  <iframe className="file-preview-frame" src={preview.url} title={preview.title} />
                </div>
              ) : (
                <div className="empty-state">
                  当前文件类型不支持站内预览，请使用下载/外部打开方式查看。
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );

  function replacePreview(next: PreviewState) {
    setPreview((current) => {
      releasePreview(current);
      return next;
    });
  }
}

async function tryLoadFileItem(id: string, preferredMode: ApiMode, objectUrls: string[]) {
  const fallbackMode: ApiMode = preferredMode === "signed" ? "rich" : "signed";

  try {
    return { item: await loadFileItem(id, preferredMode, objectUrls), mode: preferredMode };
  } catch (firstError) {
    try {
      return { item: await loadFileItem(id, fallbackMode, objectUrls), mode: fallbackMode };
    } catch (secondError) {
      if (isMissingFileError(firstError) || isMissingFileError(secondError)) {
        return { stale: true as const };
      }
      return { error: secondError instanceof Error ? secondError : firstError };
    }
  }
}

async function loadFileItem(id: string, mode: ApiMode, objectUrls: string[]) {
  if (mode === "signed") {
    const signed = await apiGet<SignedFileAsset>(`/upload/${id}/url`);
    return {
      id: signed.id,
      originalName: signed.originalName,
      mimeType: signed.mimeType,
      thumbUrl: signed.mimeType?.startsWith("image/") ? signed.url : undefined,
      rawUrl: signed.url
    } satisfies FilePreviewItem;
  }

  const meta = await apiGet<FileAssetMeta>(`/upload/${id}`);
  let thumbUrl: string | undefined;
  let rawUrl: string | undefined;

  if (meta.thumbnailKey) {
    const thumb = await apiGetBlob(`/upload/${id}/thumb`);
    thumbUrl = URL.createObjectURL(thumb.blob);
    objectUrls.push(thumbUrl);
  } else if (meta.mimeType?.startsWith("image/")) {
    const raw = await buildRawUrl(id, objectUrls);
    rawUrl = raw.url;
    thumbUrl = raw.url;
  }

  return { ...meta, thumbUrl, rawUrl };
}

async function buildRawUrl(id: string, objectUrls?: string[]) {
  const result = await apiGetBlob(`/upload/${id}/raw`);
  const url = URL.createObjectURL(result.blob);
  objectUrls?.push(url);
  return { url, managed: true };
}

function isMissingFileError(error: unknown) {
  if (!(error instanceof Error)) return false;
  const text = error.message.toLowerCase();
  return (
    text.includes("404") ||
    text.includes("file not found") ||
    text.includes("file asset not found") ||
    text.includes("not found")
  );
}

function releasePreview(preview: PreviewState | null) {
  if (preview?.managed && preview.url.startsWith("blob:")) {
    URL.revokeObjectURL(preview.url);
  }
}
