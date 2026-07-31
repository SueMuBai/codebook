package com.codebook.app;

import android.os.Build;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyPermanentlyInvalidatedException;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import androidx.annotation.NonNull;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.FragmentActivity;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.Arrays;
import java.util.concurrent.Executor;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Wraps the vault DEK with an Android Keystore key that is usable only after a
 * successful strong biometric prompt. The plaintext DEK is never persisted.
 */
@CapacitorPlugin(name = "BiometricVault")
public class BiometricVaultPlugin extends Plugin {
    private static final String KEYSTORE = "AndroidKeyStore";
    private static final String KEY_ALIAS = "codebook.biometric.dek.v1";
    private static final String PREFS = "codebook.biometric.v1";
    private static final String PREF_IV = "iv";
    private static final String PREF_CIPHER = "ciphertext";
    private static final byte[] AAD = "codebook.biometric.dek.v1".getBytes(StandardCharsets.UTF_8);
    private static final int DEK_BYTES = 32;
    private static final int AUTHENTICATORS = BiometricManager.Authenticators.BIOMETRIC_STRONG;

    @PluginMethod
    public void getStatus(PluginCall call) {
        int result = BiometricManager.from(getContext()).canAuthenticate(AUTHENTICATORS);
        JSObject response = new JSObject();
        response.put("available", result == BiometricManager.BIOMETRIC_SUCCESS);
        response.put("enabled", hasWrappedDek() && hasKey());
        response.put("reason", statusReason(result));
        call.resolve(response);
    }

    @PluginMethod
    public void enable(PluginCall call) {
        String secretB64 = call.getString("secret");
        if (secretB64 == null) {
            call.reject("缺少保险箱密钥", "INVALID_SECRET");
            return;
        }

        byte[] secret;
        try {
            secret = Base64.decode(secretB64, Base64.NO_WRAP);
        } catch (IllegalArgumentException error) {
            call.reject("保险箱密钥格式无效", "INVALID_SECRET", error);
            return;
        }
        if (secret.length != DEK_BYTES) {
            Arrays.fill(secret, (byte) 0);
            call.reject("保险箱密钥长度无效", "INVALID_SECRET");
            return;
        }

        int availability = BiometricManager.from(getContext()).canAuthenticate(AUTHENTICATORS);
        if (availability != BiometricManager.BIOMETRIC_SUCCESS) {
            Arrays.fill(secret, (byte) 0);
            rejectUnavailable(call, availability);
            return;
        }

        try {
            SecretKey key = getOrCreateKey();
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key);
            cipher.updateAAD(AAD);
            showPrompt(call, cipher, "启用生物识别", "验证指纹或人脸以保护保险箱密钥", authenticatedCipher -> {
                try {
                    byte[] ciphertext = authenticatedCipher.doFinal(secret);
                    getContext().getSharedPreferences(PREFS, 0).edit()
                        .putString(PREF_IV, Base64.encodeToString(authenticatedCipher.getIV(), Base64.NO_WRAP))
                        .putString(PREF_CIPHER, Base64.encodeToString(ciphertext, Base64.NO_WRAP))
                        .apply();
                    Arrays.fill(ciphertext, (byte) 0);
                    call.resolve();
                } catch (Exception error) {
                    call.reject("无法保护保险箱密钥", "ENCRYPT_FAILED", error);
                } finally {
                    Arrays.fill(secret, (byte) 0);
                }
            }, () -> Arrays.fill(secret, (byte) 0));
        } catch (KeyPermanentlyInvalidatedException error) {
            Arrays.fill(secret, (byte) 0);
            clearMaterial();
            call.reject("生物识别信息已变化，请重新启用", "KEY_INVALIDATED", error);
        } catch (Exception error) {
            Arrays.fill(secret, (byte) 0);
            call.reject("无法初始化生物识别密钥", "KEYSTORE_FAILED", error);
        }
    }

    @PluginMethod
    public void unlock(PluginCall call) {
        String ivB64 = getContext().getSharedPreferences(PREFS, 0).getString(PREF_IV, null);
        String ciphertextB64 = getContext().getSharedPreferences(PREFS, 0).getString(PREF_CIPHER, null);
        if (ivB64 == null || ciphertextB64 == null || !hasKey()) {
            call.reject("尚未启用生物识别解锁", "NOT_CONFIGURED");
            return;
        }

        try {
            byte[] iv = Base64.decode(ivB64, Base64.NO_WRAP);
            byte[] ciphertext = Base64.decode(ciphertextB64, Base64.NO_WRAP);
            SecretKey key = getKey();
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(128, iv));
            cipher.updateAAD(AAD);
            showPrompt(call, cipher, "解锁保险箱", "使用指纹或人脸继续", authenticatedCipher -> {
                try {
                    byte[] secret = authenticatedCipher.doFinal(ciphertext);
                    if (secret.length != DEK_BYTES) {
                        Arrays.fill(secret, (byte) 0);
                        throw new IllegalStateException("Unexpected DEK length");
                    }
                    JSObject response = new JSObject();
                    response.put("secret", Base64.encodeToString(secret, Base64.NO_WRAP));
                    call.resolve(response);
                    Arrays.fill(secret, (byte) 0);
                } catch (Exception error) {
                    call.reject("无法解封保险箱密钥", "DECRYPT_FAILED", error);
                } finally {
                    Arrays.fill(iv, (byte) 0);
                    Arrays.fill(ciphertext, (byte) 0);
                }
            }, () -> {
                Arrays.fill(iv, (byte) 0);
                Arrays.fill(ciphertext, (byte) 0);
            });
        } catch (KeyPermanentlyInvalidatedException error) {
            clearMaterial();
            call.reject("生物识别信息已变化，请使用 PIN 解锁后重新启用", "KEY_INVALIDATED", error);
        } catch (Exception error) {
            call.reject("无法读取生物识别密钥", "KEYSTORE_FAILED", error);
        }
    }

    @PluginMethod
    public void disable(PluginCall call) {
        try {
            clearMaterial();
            call.resolve();
        } catch (Exception error) {
            call.reject("无法关闭生物识别解锁", "KEYSTORE_FAILED", error);
        }
    }

    private void showPrompt(
        PluginCall call,
        Cipher cipher,
        String title,
        String subtitle,
        CipherConsumer onSuccess,
        Runnable onFailure
    ) {
        getActivity().runOnUiThread(
            () -> showPromptOnUiThread(call, cipher, title, subtitle, onSuccess, onFailure)
        );
    }

    private void showPromptOnUiThread(
        PluginCall call,
        Cipher cipher,
        String title,
        String subtitle,
        CipherConsumer onSuccess,
        Runnable onFailure
    ) {
        FragmentActivity activity = (FragmentActivity) getActivity();
        Executor executor = ContextCompat.getMainExecutor(getContext());
        BiometricPrompt prompt = new BiometricPrompt(activity, executor, new BiometricPrompt.AuthenticationCallback() {
            @Override
            public void onAuthenticationError(int errorCode, @NonNull CharSequence errString) {
                super.onAuthenticationError(errorCode, errString);
                onFailure.run();
                call.reject(errString.toString(), biometricErrorCode(errorCode));
            }

            @Override
            public void onAuthenticationSucceeded(@NonNull BiometricPrompt.AuthenticationResult result) {
                super.onAuthenticationSucceeded(result);
                BiometricPrompt.CryptoObject crypto = result.getCryptoObject();
                if (crypto == null || crypto.getCipher() == null) {
                    onFailure.run();
                    call.reject("生物识别未返回加密授权", "AUTH_FAILED");
                    return;
                }
                onSuccess.accept(crypto.getCipher());
            }

            @Override
            public void onAuthenticationFailed() {
                super.onAuthenticationFailed();
                // The prompt stays open and permits another attempt.
            }
        });

        BiometricPrompt.PromptInfo info = new BiometricPrompt.PromptInfo.Builder()
            .setTitle(title)
            .setSubtitle(subtitle)
            .setAllowedAuthenticators(AUTHENTICATORS)
            .setNegativeButtonText("使用 PIN")
            .setConfirmationRequired(false)
            .build();
        prompt.authenticate(info, new BiometricPrompt.CryptoObject(cipher));
    }

    private SecretKey getOrCreateKey() throws Exception {
        SecretKey existing = getKey();
        if (existing != null) return existing;

        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE);
        KeyGenParameterSpec.Builder builder = new KeyGenParameterSpec.Builder(
            KEY_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .setUserAuthenticationRequired(true);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            builder.setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG);
        } else {
            builder.setUserAuthenticationValidityDurationSeconds(-1);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            builder.setInvalidatedByBiometricEnrollment(true);
        }
        generator.init(builder.build());
        return generator.generateKey();
    }

    private SecretKey getKey() throws Exception {
        KeyStore store = KeyStore.getInstance(KEYSTORE);
        store.load(null);
        KeyStore.Entry entry = store.getEntry(KEY_ALIAS, null);
        return entry instanceof KeyStore.SecretKeyEntry
            ? ((KeyStore.SecretKeyEntry) entry).getSecretKey()
            : null;
    }

    private boolean hasKey() {
        try {
            return getKey() != null;
        } catch (Exception ignored) {
            return false;
        }
    }

    private boolean hasWrappedDek() {
        return getContext().getSharedPreferences(PREFS, 0).contains(PREF_IV)
            && getContext().getSharedPreferences(PREFS, 0).contains(PREF_CIPHER);
    }

    private void clearMaterial() {
        getContext().getSharedPreferences(PREFS, 0).edit().clear().apply();
        try {
            KeyStore store = KeyStore.getInstance(KEYSTORE);
            store.load(null);
            store.deleteEntry(KEY_ALIAS);
        } catch (Exception ignored) {
            // Preferences are already cleared, so stale key material is unreachable.
        }
    }

    private void rejectUnavailable(PluginCall call, int status) {
        call.reject(statusMessage(status), statusReason(status));
    }

    private String statusReason(int status) {
        switch (status) {
            case BiometricManager.BIOMETRIC_SUCCESS: return "AVAILABLE";
            case BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED: return "NOT_ENROLLED";
            case BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE: return "NO_HARDWARE";
            case BiometricManager.BIOMETRIC_ERROR_HW_UNAVAILABLE: return "HW_UNAVAILABLE";
            case BiometricManager.BIOMETRIC_ERROR_SECURITY_UPDATE_REQUIRED: return "SECURITY_UPDATE_REQUIRED";
            case BiometricManager.BIOMETRIC_ERROR_UNSUPPORTED: return "UNSUPPORTED";
            default: return "UNAVAILABLE";
        }
    }

    private String statusMessage(int status) {
        switch (status) {
            case BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED: return "请先在系统设置中录入指纹或人脸";
            case BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE: return "设备不支持生物识别";
            case BiometricManager.BIOMETRIC_ERROR_HW_UNAVAILABLE: return "生物识别硬件暂时不可用";
            default: return "当前设备无法使用强生物识别";
        }
    }

    private String biometricErrorCode(int errorCode) {
        switch (errorCode) {
            case BiometricPrompt.ERROR_NEGATIVE_BUTTON:
            case BiometricPrompt.ERROR_USER_CANCELED:
            case BiometricPrompt.ERROR_CANCELED:
                return "CANCELLED";
            case BiometricPrompt.ERROR_LOCKOUT:
            case BiometricPrompt.ERROR_LOCKOUT_PERMANENT:
                return "LOCKED_OUT";
            default:
                return "AUTH_ERROR";
        }
    }

    private interface CipherConsumer {
        void accept(Cipher cipher);
    }
}
