export function getMediaUrl(url, baseUrl = "") {
    if (!url) return "";

    if (
        url.startsWith("http://") ||
        url.startsWith("https://") ||
        url.startsWith("blob:")
    ) {
        return url;
    }

    const cleanBase = baseUrl.replace(/\/$/, "");

    if (url.startsWith("/")) {
        return `${cleanBase}${url}`;
    }

    return `${cleanBase}/${url}`;
}