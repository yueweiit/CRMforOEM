export function repairMojibakeFileName(fileName: string) {
  if (!/[\u0080-\u00ff]/.test(fileName) || Array.from(fileName).some((char) => char.charCodeAt(0) > 0xff)) {
    return fileName;
  }

  const bytes = Uint8Array.from(fileName, (char) => char.charCodeAt(0));
  let repaired = "";
  try {
    repaired = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return fileName;
  }

  if (mojibakeScore(repaired) >= mojibakeScore(fileName)) {
    return fileName;
  }
  return repaired;
}

function mojibakeScore(fileName: string) {
  return (fileName.match(/[ÃÂÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿ]/g)?.length ?? 0)
    + (fileName.match(/[\u0080-\u009f]/g)?.length ?? 0) * 2;
}
