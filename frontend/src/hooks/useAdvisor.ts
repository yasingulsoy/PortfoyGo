'use client';

import useSWR from 'swr';
import { ApiError, advisorApi } from '@/lib/api';

/** Uç henüz yoksa / kayıt bulunamadıysa tekrar denemeye gerek yok. */
const retryUnlessMissing = (err: unknown) => !(err instanceof ApiError && [400, 403, 404].includes(err.status));

const OPTS = { revalidateOnFocus: false, shouldRetryOnError: retryUnlessMissing } as const;

/** Anket soruları ve profil tanımları (nadiren değişir). */
export function useAdvisorQuestionnaire() {
  return useSWR(advisorApi.questionnaireKey, () => advisorApi.questionnaire(), { ...OPTS, revalidateIfStale: false });
}

/** Kullanıcının en son risk profili (yoksa null). */
export function useAdvisorProfile() {
  return useSWR(advisorApi.profileKey, () => advisorApi.profile(), OPTS);
}

/** Geçmiş öneriler (en yeniden eskiye). */
export function useAdvisorPlans(limit = 10) {
  return useSWR(advisorApi.plansKey(limit), () => advisorApi.plans(limit), { ...OPTS, keepPreviousData: true });
}

/** Tek bir öneri (geçmişten açıldığında). */
export function useAdvisorPlan(id: string | null) {
  return useSWR(id ? advisorApi.planKey(id) : null, () => advisorApi.plan(id!), OPTS);
}
