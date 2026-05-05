import { router, Stack } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppModal } from '@/components/app-modal';
import { Toast } from '@/components/toast';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { supabase } from '@src/api/supabase';
import { captureError } from '@src/services/sentry';
import { isTimeoutError, withTimeout } from '@src/utils/timeout';

const UPLOAD_TIMEOUT_MS = 20000;
const INSERT_TIMEOUT_MS = 15000;

const MAX_IMAGES = 3;
const MAX_BODY_LENGTH = 500;

export default function InquiryScreen() {
  const { t } = useTranslation();
  const colorScheme = useColorScheme();
  const dark = colorScheme === 'dark';

  const [body, setBody] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [successModal, setSuccessModal] = useState(false);
  const [errorModal, setErrorModal] = useState('');
  const [photoDeniedModal, setPhotoDeniedModal] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  const hasBody = body.trim().length > 0;
  const canSubmit = hasBody && !submitting;

  const pickImage = async () => {
    if (images.length >= MAX_IMAGES) return;

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      setPhotoDeniedModal(true);
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      allowsMultipleSelection: true,
      selectionLimit: MAX_IMAGES - images.length,
    });

    if (result.canceled) return;

    const uris = result.assets.map((a) => a.uri);
    setImages((prev) => [...prev, ...uris].slice(0, MAX_IMAGES));
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (submitting) return;
    if (!hasBody) {
      setToastMessage(t('inquiry.body_required'));
      return;
    }
    setSubmitting(true);

    try {
      const { data: session } = await supabase.auth.getSession();
      const userId = session.session?.user?.id;
      const email = session.session?.user?.email ?? null;
      if (!userId) {
        setErrorModal(t('inquiry.login_required'));
        setSubmitting(false);
        return;
      }

      const uploadedUrls: string[] = [];
      for (const uri of images) {
        const ext = uri.split('.').pop()?.toLowerCase() ?? 'jpg';
        const fileName = `${userId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

        const response = await fetch(uri);
        const blob = await response.blob();
        const arrayBuffer = await new Response(blob).arrayBuffer();

        const { error: uploadError } = await withTimeout(
          supabase.storage
            .from('inquiries')
            .upload(fileName, arrayBuffer, { contentType: `image/${ext}`, upsert: false }),
          UPLOAD_TIMEOUT_MS,
        );

        if (uploadError) {
          captureError(uploadError, { service: 'inquiry', fn: 'uploadImage' });
          continue;
        }

        const { data: urlData } = supabase.storage.from('inquiries').getPublicUrl(fileName);
        uploadedUrls.push(urlData.publicUrl);
      }

      const { error } = await withTimeout(
        supabase.from('inquiries').insert({
          user_id: userId,
          email,
          body: body.trim(),
          image_urls: uploadedUrls,
        }),
        INSERT_TIMEOUT_MS,
      );

      if (error) {
        captureError(error, { service: 'inquiry', fn: 'insert' });
        setErrorModal(t('inquiry.submit_failed'));
        setSubmitting(false);
        return;
      }

      setSuccessModal(true);
    } catch (e) {
      if (isTimeoutError(e)) {
        setToastMessage(t('error.slow_network'));
        setSubmitting(false);
        return;
      }
      captureError(e, { service: 'inquiry', fn: 'handleSubmit' });
      setErrorModal(t('inquiry.submit_failed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 bg-white dark:bg-black">
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        <ScrollView className="flex-1" contentContainerStyle={{ padding: 24, paddingBottom: 80 }} keyboardShouldPersistTaps="handled">
          <View className="flex-row items-center">
            <Pressable onPress={() => router.back()} className="mr-2 p-1">
              <MaterialIcons name="arrow-back" size={24} color="#6b7280" />
            </Pressable>
            <Text className="text-3xl font-bold text-black dark:text-white">
              {t('inquiry.title')}
            </Text>
          </View>

          {/* Body input */}
          <TextInput
            value={body}
            onChangeText={(text) => text.length <= MAX_BODY_LENGTH && setBody(text)}
            placeholder={t('inquiry.placeholder')}
            placeholderTextColor="#9ca3af"
            multiline
            textAlignVertical="top"
            className="mt-6 min-h-[200px] rounded-2xl border border-gray-300 p-4 text-base text-black dark:border-gray-700 dark:text-white"
            style={{ backgroundColor: dark ? '#111' : '#fafafa' }}
          />

          <Text className="mt-1 text-right text-xs text-gray-400">
            {body.length}/{MAX_BODY_LENGTH}
          </Text>

          {/* Image picker */}
          <View className="mt-4">
            <View className="flex-row flex-wrap gap-3">
              {images.map((uri, i) => (
                <View key={uri} className="relative">
                  <Image
                    source={{ uri }}
                    className="h-24 w-24 rounded-xl"
                    resizeMode="cover"
                  />
                  <Pressable
                    onPress={() => removeImage(i)}
                    className="absolute -right-2 -top-2 h-6 w-6 items-center justify-center rounded-full bg-black/70"
                  >
                    <MaterialIcons name="close" size={14} color="#fff" />
                  </Pressable>
                </View>
              ))}

              {images.length < MAX_IMAGES && (
                <Pressable
                  onPress={pickImage}
                  className="h-24 w-24 items-center justify-center rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600"
                >
                  <MaterialIcons name="add-photo-alternate" size={28} color="#9ca3af" />
                  <Text className="mt-1 text-xs text-gray-400">
                    {images.length}/{MAX_IMAGES}
                  </Text>
                </Pressable>
              )}
            </View>
          </View>

          {/* Submit button */}
          <View className="mt-6">
            <Pressable
              onPress={handleSubmit}
              disabled={submitting}
              className={`items-center rounded-xl py-4 ${
                !canSubmit ? 'bg-gray-300 dark:bg-gray-700' : 'bg-black dark:bg-white'
              }`}
            >
              {submitting ? (
                <ActivityIndicator color={dark ? '#000' : '#fff'} />
              ) : (
                <Text
                  className={`text-base font-semibold ${
                    !canSubmit ? 'text-gray-400' : 'text-white dark:text-black'
                  }`}
                >
                  {t('inquiry.submit')}
                </Text>
              )}
            </Pressable>
            <Toast
              visible={!!toastMessage}
              message={toastMessage}
              onHide={() => setToastMessage('')}
              style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', pointerEvents: 'none' }}
            />
          </View>

          <View className="h-8" />
        </ScrollView>
      </KeyboardAvoidingView>

      <AppModal
        visible={successModal}
        title={t('inquiry.success_title')}
        message={t('inquiry.success_message')}
        buttonText={t('review.check')}
        onClose={() => {
          setSuccessModal(false);
          router.back();
        }}
      />

      <AppModal
        visible={!!errorModal}
        title={t('inquiry.error')}
        message={errorModal}
        buttonText={t('review.check')}
        onClose={() => setErrorModal('')}
      />

      <AppModal
        visible={photoDeniedModal}
        title={t('inquiry.permission_title')}
        message={t('inquiry.permission_message')}
        buttonText={t('common.close')}
        confirmText={t('settings.open_settings')}
        onConfirm={() => {
          setPhotoDeniedModal(false);
          Linking.openSettings();
        }}
        onClose={() => setPhotoDeniedModal(false)}
      />
    </SafeAreaView>
  );
}
