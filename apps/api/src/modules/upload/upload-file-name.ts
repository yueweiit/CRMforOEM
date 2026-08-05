export function resolveUploadFileName(clientFileName: string | undefined, multipartFileName: string) {
  const candidate = clientFileName?.trim() || multipartFileName;
  return repairMojibakeFileName(candidate.replace(/^.*[\\/]/, "") || multipartFileName);
}

export function repairMojibakeFileName(fileName: string) {
  if (!/[\u0080-\u00ff]/.test(fileName) || Array.from(fileName).some((char) => char.charCodeAt(0) > 0xff)) {
    return fileName;
  }

  const repaired = Buffer.from(fileName, "latin1").toString("utf8");
  if (repaired.includes("\ufffd") || mojibakeScore(repaired) >= mojibakeScore(fileName)) {
    return fileName;
  }
  return repaired;
}

function mojibakeScore(fileName: string) {
  return (fileName.match(/[ÃÂÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿ]/g)?.length ?? 0)
    + (fileName.match(/[\u0080-\u009f]/g)?.length ?? 0) * 2;
}
