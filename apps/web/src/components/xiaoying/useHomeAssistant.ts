import { useEffect, useMemo, useState } from 'react';
import { HOME_XIAOYING_PLACEMENT, PUBLIC_SITE_SCOPE, type PublicPlacementManifest } from '@walker/shared';
import { publicApi } from '../../api/public-api';
import { useAssistant } from '../../hooks/useAssistant';

/** 首页位置的部署成员和访客业务历史；桌宠外观不持有这些加载规则。 */
export function useHomeAssistant() {
  const [manifest, setManifest] = useState<PublicPlacementManifest | null>(null);
  const [manifestLoading, setManifestLoading] = useState(true);
  const [selectedMemberKey, setSelectedMemberKey] = useState<string | null>(null);
  const selectedMember = manifest?.members.find((member) => member.key === selectedMemberKey)
    ?? manifest?.members.find((member) => member.key === manifest.defaultMemberKey)
    ?? manifest?.members[0] ?? null;
  const assistantContext = useMemo(() => ({
    placementKey: HOME_XIAOYING_PLACEMENT,
    scopeSlug: PUBLIC_SITE_SCOPE,
    memberKey: manifest?.available && manifest.aiEnabled ? selectedMember?.key ?? null : null,
    deploymentGeneration: manifest?.available && manifest.aiEnabled ? manifest.generation : null,
    member: manifest?.available && manifest.aiEnabled && selectedMember
      ? { name: selectedMember.name, revision: selectedMember.revision }
      : null,
  }), [manifest, selectedMember]);
  const assistant = useAssistant(assistantContext);
  const { generationConflict, restoreHistory } = assistant;

  useEffect(() => {
    let current = true;
    void Promise.allSettled([
      publicApi.assistantPlacement(HOME_XIAOYING_PLACEMENT, PUBLIC_SITE_SCOPE),
      publicApi.assistantHistory(HOME_XIAOYING_PLACEMENT, PUBLIC_SITE_SCOPE),
    ]).then(([placementResult, historyResult]) => {
      if (!current) return;
      if (placementResult.status === 'fulfilled') {
        setManifest(placementResult.value);
        setSelectedMemberKey(placementResult.value.defaultMemberKey ?? placementResult.value.members[0]?.key ?? null);
      }
      if (historyResult.status === 'fulfilled') restoreHistory(historyResult.value);
      setManifestLoading(false);
    });
    return () => { current = false; };
  }, [restoreHistory]);

  useEffect(() => {
    if (!generationConflict) return;
    let current = true;
    void publicApi.assistantPlacement(HOME_XIAOYING_PLACEMENT, PUBLIC_SITE_SCOPE).then((value) => {
      if (!current) return;
      setManifest(value);
      setSelectedMemberKey(value.defaultMemberKey ?? value.members[0]?.key ?? null);
    }).catch(() => { if (current) setManifest(null); });
    return () => { current = false; };
  }, [generationConflict]);

  return { ...assistant, manifest, manifestLoading, selectedMember, setSelectedMemberKey };
}
