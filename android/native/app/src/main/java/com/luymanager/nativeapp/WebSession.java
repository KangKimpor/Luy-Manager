package com.luymanager.nativeapp;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import org.json.JSONObject;

/**
 * Converts the app's stored sign-in to the cookies the web app reads, and back. The web app uses
 * the Supabase SSR cookie format: "base64-" plus the base64url session JSON, split into chunks of
 * at most 3180 characters named "<name>.0", "<name>.1" and so on.
 */
final class WebSession {
  static final int CHUNK = 3180;
  private static final String PREFIX = "base64-";

  private WebSession() {}

  /** The project reference is the first label of the Supabase host name. */
  static String ref(String supabaseUrl) {
    String host = URI.create(supabaseUrl).getHost();
    return host.substring(0, host.indexOf('.'));
  }

  static String name(String ref) {
    return "sb-" + ref + "-auth-token";
  }

  static LinkedHashMap<String, String> cookies(String ref, JSONObject session) {
    String encoded =
        PREFIX
            + Base64.getUrlEncoder()
                .withoutPadding()
                .encodeToString(session.toString().getBytes(StandardCharsets.UTF_8));
    LinkedHashMap<String, String> out = new LinkedHashMap<>();
    String name = name(ref);
    if (encoded.length() <= CHUNK) {
      out.put(name, encoded);
      return out;
    }
    for (int i = 0, n = 0; i < encoded.length(); i += CHUNK, n++)
      out.put(name + "." + n, encoded.substring(i, Math.min(encoded.length(), i + CHUNK)));
    return out;
  }

  /** The session stored in these cookies, or null when absent or unreadable. */
  static JSONObject parse(String ref, Map<String, String> cookies) {
    String name = name(ref);
    String whole = cookies.get(name);
    if (whole == null) {
      StringBuilder joined = new StringBuilder();
      for (int i = 0; cookies.containsKey(name + "." + i); i++)
        joined.append(cookies.get(name + "." + i));
      if (joined.length() == 0) return null;
      whole = joined.toString();
    }
    try {
      String json =
          whole.startsWith(PREFIX)
              ? new String(
                  Base64.getUrlDecoder().decode(whole.substring(PREFIX.length())),
                  StandardCharsets.UTF_8)
              : java.net.URLDecoder.decode(whole, "UTF-8");
      return new JSONObject(json);
    } catch (Exception e) {
      return null;
    }
  }

  /** Splits a Cookie header such as "a=1; b=2" into name and value pairs. */
  static Map<String, String> parseHeader(String header) {
    LinkedHashMap<String, String> out = new LinkedHashMap<>();
    if (header == null) return out;
    for (String part : header.split(";")) {
      int eq = part.indexOf('=');
      if (eq > 0) out.put(part.substring(0, eq).trim(), part.substring(eq + 1).trim());
    }
    return out;
  }
}