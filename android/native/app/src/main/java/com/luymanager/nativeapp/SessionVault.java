package com.luymanager.nativeapp;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import org.json.JSONObject;

final class SessionVault {
  private final Context context;

  SessionVault(Context context) {
    this.context = context;
  }

  private SecretKey key() throws Exception {
    KeyStore store = KeyStore.getInstance("AndroidKeyStore");
    store.load(null);
    String alias = "luy-native-session-v1";
    if (!store.containsAlias(alias)) {
      KeyGenerator generator = KeyGenerator.getInstance("AES", "AndroidKeyStore");
      generator.init(
          new KeyGenParameterSpec.Builder(
                  alias, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
              .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
              .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
              .build());
      generator.generateKey();
    }
    return (SecretKey) store.getKey(alias, null);
  }

  synchronized void save(JSONObject value) throws Exception {
    Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
    cipher.init(Cipher.ENCRYPT_MODE, key());
    JSONObject sealed =
        new JSONObject()
            .put("iv", Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP))
            .put(
                "value",
                Base64.encodeToString(
                    cipher.doFinal(value.toString().getBytes(StandardCharsets.UTF_8)),
                    Base64.NO_WRAP));
    if (!context
        .getSharedPreferences("vault", 0)
        .edit()
        .putString("session", sealed.toString())
        .commit()) throw new Exception("Could not store the session securely");
  }

  synchronized JSONObject load() throws Exception {
    String text = context.getSharedPreferences("vault", 0).getString("session", null);
    if (text == null) return null;
    JSONObject sealed = new JSONObject(text);
    Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
    cipher.init(
        Cipher.DECRYPT_MODE,
        key(),
        new GCMParameterSpec(128, Base64.decode(sealed.getString("iv"), Base64.NO_WRAP)));
    return new JSONObject(
        new String(
            cipher.doFinal(Base64.decode(sealed.getString("value"), Base64.NO_WRAP)),
            StandardCharsets.UTF_8));
  }

  synchronized void clear() throws Exception {
    if (!context.getSharedPreferences("vault", 0).edit().clear().commit())
      throw new Exception("Could not clear the secure session. Try signing out again.");
  }
}
