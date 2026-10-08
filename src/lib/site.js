// Public address used in shared links. Kept constant (not window.location) so
// links shared from the phone apps (capacitor://localhost) still open the website.
export const SITE_URL = "https://www.pixsup.com";

export const postUrl = (postId) => `${SITE_URL}/p/${postId}`;
