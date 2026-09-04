import { useMemo, useState } from 'react';
import type { AbilityScore, AbilityScores, Character, CharacterFeature } from '../../types/dnd';
import { ABILITY_LABELS } from '../../types/dnd';
import { useClasses } from '../../hooks/useClasses';
import { useRaces } from '../../hooks/useRaces';
import {
  setCharacterLevel,
  hitDieNumber,
  isAsiLevel,
  SUBCLASSES,
  toCharacterFeatures,
} from '../../utils/characterBuilder';
import { getModifier, formatModifier } from '../../utils/character';
import {
  getChoiceCatalog,
  CHOICE_CATALOG_LABELS,
  type TableOption,
} from '../../data/featureTables';
import { X, TrendingUp, TrendingDown } from 'lucide-react';

interface Props {
  character: Character;
  onConfirm: (updated: Character) => void;
  onClose: () => void;
}

const ABILITIES: AbilityScore[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

export function ManageLevelsModal({ character, onConfirm, onClose }: Props) {
  const { classes } = useClasses();
  const { races } = useRaces();
  const classData = classes.find(
    (c) => c.id === character.classId || c.name === character.class
  );
  const raceData = races.find(
    (r) => r.id === character.raceId || r.name === character.race
  );

  const [targetLevel, setTargetLevel] = useState(character.level);
  const die = hitDieNumber(classData?.hitDie || 'd8');
  const avgHp = Math.floor(die / 2) + 1;
  const conMod = getModifier(character.abilityScores.con);

  const [hpMode, setHpMode] = useState<'avg' | 'roll'>('avg');
  const [rolledPerLevel, setRolledPerLevel] = useState(avgHp);
  const [asi, setAsi] = useState<Partial<AbilityScores>>({});
  const asiBudget = 2;
  const [subclassId, setSubclassId] = useState(character.subclassId || '');
  const [catalogPicks, setCatalogPicks] = useState<Record<string, string[]>>({});

  const goingUp = targetLevel > character.level;
  const goingDown = targetLevel < character.level;
  const levelsDiff = Math.abs(targetLevel - character.level);

  const subclassOptions = classData?.subclasses?.length
    ? classData.subclasses
    : classData
    ? SUBCLASSES[classData.id] || []
    : [];

  const subclassLevel =
    classData?.features.find((f) =>
      /subclase|arquetipo|camino|colegio|dominio|juramento|c[ií]rculo|tradici[oó]n|origen|patr[oó]n/i.test(
        f.name
      )
    )?.level || 3;

  const needsSubclass =
    goingUp &&
    !character.subclass &&
    subclassOptions.length > 0 &&
    targetLevel >= subclassLevel;

  /** Normaliza nombre para detectar rasgos repetidos (ASI, etc.) */
  const normName = (n: string) =>
    n
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .replace(/\s+/g, ' ')
      .trim();

  /** Rasgos de clase nuevos entre nivel actual+1 y target (solo al subir); sin duplicados por id/nombre */
  const featuresGained = useMemo(() => {
    if (!classData || !goingUp) return [];
    const existingIds = new Set(character.features.map((f) => f.id));
    const existingNames = new Set(
      character.features.map((f) => normName(f.name || '')).filter(Boolean)
    );
    const seenNames = new Set<string>();
    const out: typeof classData.features = [];
    for (const f of classData.features) {
      if (f.level <= character.level || f.level > targetLevel) continue;
      if (existingIds.has(f.id)) continue;
      const nn = normName(f.name || '');
      // ASI / mejora de característica: no listar repetidos; se manejan con presupuesto ASI
      if (/mejora de caracteristica|ability score improvement|^asi\b/i.test(nn)) {
        continue;
      }
      // Elegir subclase/camino: se maneja con el selector de subclase, no texto libre
      if (
        /^(subclase|arquetipo|camino|colegio|dominio|juramento|circulo|tradicion|origen de|patron)/i.test(
          nn
        ) ||
        /subclase de |elige (tu |una )?subclase|consigues una subclase/i.test(nn)
      ) {
        continue;
      }
      if (nn && (existingNames.has(nn) || seenNames.has(nn))) continue;
      if (nn) seenNames.add(nn);
      out.push(f);
    }
    return out;
  }, [classData, character.features, character.level, targetLevel, goingUp]);

  const subclassFeaturesGained = useMemo(() => {
    if (!goingUp) return [];
    const sid = subclassId || character.subclassId;
    const sub = subclassOptions.find((s) => s.id === sid);
    if (!sub) return [];
    const existingIds = new Set(character.features.map((f) => f.id));
    const existingNames = new Set(
      character.features.map((f) => normName(f.name || '')).filter(Boolean)
    );
    const seenNames = new Set<string>();
    const out: typeof sub.features = [];
    for (const f of sub.features) {
      if (f.level <= character.level || f.level > targetLevel) continue;
      if (existingIds.has(f.id)) continue;
      const nn = normName(f.name || '');
      if (nn && (existingNames.has(nn) || seenNames.has(nn))) continue;
      if (nn) seenNames.add(nn);
      out.push(f);
    }
    return out;
  }, [
    goingUp,
    subclassId,
    character.subclassId,
    character.features,
    character.level,
    targetLevel,
    subclassOptions,
  ]);

  /** ASI levels crossed while going up */
  const asiLevelsCrossed = useMemo(() => {
    if (!goingUp) return [];
    const list: number[] = [];
    for (let lv = character.level + 1; lv <= targetLevel; lv++) {
      if (isAsiLevel(lv)) list.push(lv);
    }
    return list;
  }, [goingUp, character.level, targetLevel]);

  const needsAsi = asiLevelsCrossed.length > 0;
  // Si cruza varios ASI, pedir 2 puntos por cada uno
  const totalAsiBudget = asiLevelsCrossed.length * asiBudget;

  const hpGainPerLevel =
    Math.max(1, (hpMode === 'avg' ? avgHp : rolledPerLevel) + conMod);
  const totalHpGain = goingUp ? hpGainPerLevel * levelsDiff : 0;
  const estimatedHpLoss = goingDown
    ? Math.max(1, avgHp + conMod) * levelsDiff
    : 0;

  const asiSpent = Object.values(asi).reduce((s, v) => s + (v || 0), 0);

  const applyAsiPoint = (ability: AbilityScore, delta: number) => {
    setAsi((prev) => {
      const current = prev[ability] || 0;
      const next = Math.max(0, current + delta);
      const others = Object.entries(prev)
        .filter(([k]) => k !== ability)
        .reduce((s, [, v]) => s + (v || 0), 0);
      if (others + next > totalAsiBudget) return prev;
      if (character.abilityScores[ability] + next > 20) return prev;
      return { ...prev, [ability]: next || undefined };
    });
  };

  const inferChoiceKey = (f: { name?: string; choiceKey?: string }) => {
    if (f.choiceKey) return f.choiceKey;
    const n = (f.name || '').toLowerCase();
    if (/estilo de combate|fighting style/.test(n)) return 'fighting-style';
    if (/metamagia|metamagic/.test(n)) return 'metamagic';
    if (/maniobra|maneuver/.test(n)) return 'maneuvers';
    if (/invocaci[oó]n/.test(n)) return 'invocation';
    if (/bendici[oó]n de pacto|pact boon|pacto de la/.test(n)) return 'pact-boon';
    if (/maestr[ií]a con armas/.test(n)) return 'weapon-mastery-melee';
    if (/conocimiento primigenio/.test(n)) return 'barbarian-skill';
    if (/golpe brutal/.test(n)) return 'brutal-strike';
    if (/furia de lo salvaje/.test(n)) return 'wild-heart-rage';
    if (/aspecto de lo salvaje/.test(n)) return 'wild-heart-aspect';
    if (/poder de lo salvaje/.test(n)) return 'wild-heart-power';
    return undefined;
  };

  const toggleCatalogPick = (featureId: string, optionId: string, multi: boolean) => {
    setCatalogPicks((prev) => {
      const cur = prev[featureId] || [];
      if (!multi) return { ...prev, [featureId]: [optionId] };
      const set = new Set(cur);
      if (set.has(optionId)) set.delete(optionId);
      else set.add(optionId);
      return { ...prev, [featureId]: Array.from(set) };
    });
  };

  const handleConfirm = () => {
    if (needsAsi && asiSpent !== totalAsiBudget) {
      alert(`Debes distribuir exactamente ${totalAsiBudget} puntos de característica (ASI).`);
      return;
    }
    if (needsSubclass && !subclassId) {
      alert('Elige una subclase.');
      return;
    }

    const sub = subclassOptions.find((s) => s.id === subclassId);

    let updated = setCharacterLevel(character, classData, targetLevel, {
      hpDelta: goingUp ? totalHpGain : undefined,
      raceData: raceData ? { traits: raceData.traits } : undefined,
      asi: needsAsi ? asi : undefined,
      subclassId: needsSubclass ? subclassId : character.subclassId,
      subclassName: needsSubclass ? sub?.name : character.subclass,
    });

    // Aplicar elecciones a rasgos nuevos
    const choiceSources = [...featuresGained, ...subclassFeaturesGained];
    const notes: string[] = [];

    for (const f of choiceSources) {
      const cKey = inferChoiceKey(f);
      const picks = catalogPicks[f.id] || [];
      const answerFromCatalog =
        cKey && picks.length
          ? picks
              .map((id) => getChoiceCatalog(cKey).find((o) => o.id === id)?.name || id)
              .join(', ')
          : '';
      const answer = answerFromCatalog;

      if (cKey === 'metamagic' && picks.length) {
        const known = new Set([...(character.metamagicKnown || []), ...picks]);
        updated = { ...updated, metamagicKnown: Array.from(known) };
      }
      if (cKey === 'maneuvers' && picks.length) {
        const known = new Set([...(character.maneuversKnown || []), ...picks]);
        updated = { ...updated, maneuversKnown: Array.from(known) };
      }

      if (answer) {
        notes.push(`${f.name}: ${answer}`);
        updated = {
          ...updated,
          features: updated.features.map((feat: CharacterFeature) =>
            feat.id === f.id || feat.name === f.name
              ? { ...feat, description: `${feat.description}\n\nElección: ${answer}` }
              : feat
          ),
        };
      }
    }

    // Asegurar rasgos de subclase al elegirla ahora
    if (needsSubclass && sub) {
      const already = new Set(updated.features.map((f) => f.id));
      const toAdd = toCharacterFeatures(
        sub.features.filter((f) => f.level <= targetLevel && !already.has(f.id)),
        'subclass',
        targetLevel
      );
      if (toAdd.length) {
        updated = { ...updated, features: [...updated.features, ...toAdd] };
      }
    }

    if (notes.length) {
      updated = {
        ...updated,
        notes: [updated.notes || '', '— Elecciones al gestionar niveles —', ...notes]
          .filter(Boolean)
          .join('\n'),
      };
    }

    onConfirm(updated);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-2 sm:p-4 pb-24 sm:pb-4 overflow-x-hidden">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-parchment-50 border-2 border-ink-900 rounded-xl w-full max-w-lg max-h-[min(90dvh,calc(100dvh-7rem))] overflow-y-auto overflow-x-hidden shadow-2xl break-words">
        <div className="bg-ink-900 text-parchment-50 p-4 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-2">
            {goingDown ? (
              <TrendingDown className="w-5 h-5" />
            ) : (
              <TrendingUp className="w-5 h-5" />
            )}
            <h2 className="font-display font-bold text-lg">Gestionar niveles</h2>
          </div>
          <button type="button" onClick={onClose} className="p-1 hover:bg-ink-700 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <section className="bg-white border border-ink-200 rounded-lg p-3">
            <h3 className="font-bold text-sm mb-2">Nivel objetivo</h3>
            <p className="text-xs text-ink-600 mb-2">
              Actual: <strong>{character.level}</strong> → Objetivo:{' '}
              <strong>{targetLevel}</strong>
              {goingUp && ' (subir)'}
              {goingDown && ' (bajar — se quitarán rasgos de niveles superiores)'}
              {!goingUp && !goingDown && ' (sin cambio de nivel)'}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setTargetLevel((l) => Math.max(1, l - 1))}
                className="px-3 py-1 border-2 border-ink-400 rounded-lg font-bold"
              >
                −
              </button>
              <input
                type="number"
                min={1}
                max={20}
                value={targetLevel}
                onChange={(e) =>
                  setTargetLevel(Math.min(20, Math.max(1, parseInt(e.target.value) || 1)))
                }
                className="w-16 text-center px-2 py-1 border-2 border-ink-300 rounded-lg font-bold"
              />
              <button
                type="button"
                onClick={() => setTargetLevel((l) => Math.min(20, l + 1))}
                className="px-3 py-1 border-2 border-ink-400 rounded-lg font-bold"
              >
                +
              </button>
              <div className="flex flex-wrap gap-1 ml-2">
                {[1, 5, 10, 15, 20].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setTargetLevel(n)}
                    className={`text-[10px] px-1.5 py-0.5 rounded border ${
                      targetLevel === n ? 'bg-ink-800 text-white' : 'bg-ink-100'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {goingUp && (
            <section className="bg-white border border-ink-200 rounded-lg p-3">
              <h3 className="font-bold text-sm mb-2">
                Puntos de golpe (+{levelsDiff} nivel{levelsDiff > 1 ? 'es' : ''})
              </h3>
              <div className="flex gap-2 mb-2">
                <button
                  type="button"
                  onClick={() => setHpMode('avg')}
                  className={`px-3 py-1 rounded text-sm ${
                    hpMode === 'avg' ? 'bg-crimson-600 text-white' : 'bg-ink-100'
                  }`}
                >
                  Promedio (+{avgHp}/niv)
                </button>
                <button
                  type="button"
                  onClick={() => setHpMode('roll')}
                  className={`px-3 py-1 rounded text-sm ${
                    hpMode === 'roll' ? 'bg-crimson-600 text-white' : 'bg-ink-100'
                  }`}
                >
                  Tirada 1d{die}/niv
                </button>
              </div>
              {hpMode === 'roll' && (
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="number"
                    min={1}
                    max={die}
                    value={rolledPerLevel}
                    onChange={(e) =>
                      setRolledPerLevel(
                        Math.min(die, Math.max(1, parseInt(e.target.value) || 1))
                      )
                    }
                    className="w-16 px-2 py-1 border rounded text-center"
                  />
                  <button
                    type="button"
                    onClick={() => setRolledPerLevel(Math.floor(Math.random() * die) + 1)}
                    className="text-xs px-2 py-1 bg-ink-200 rounded"
                  >
                    Aleatorio
                  </button>
                </div>
              )}
              <p className="text-sm">
                Ganancia total: <strong>+{totalHpGain}</strong> (dado + Con{' '}
                {formatModifier(conMod)} × {levelsDiff})
                <br />
                PG máximos: {character.hitPointMax} → {character.hitPointMax + totalHpGain}
              </p>
            </section>
          )}

          {goingDown && (
            <section className="bg-amber-50 border border-amber-300 rounded-lg p-3 text-sm">
              <p>
                Al bajar de nivel se recalculan PG (estimación −{estimatedHpLoss}), espacios de
                conjuro, competencia y se <strong>eliminan rasgos</strong> de niveles superiores a{' '}
                {targetLevel}.
              </p>
              {targetLevel < subclassLevel && character.subclass && (
                <p className="mt-1 text-amber-900 font-semibold">
                  También se quitará la subclase ({character.subclass}) al quedar bajo el nivel{' '}
                  {subclassLevel}.
                </p>
              )}
            </section>
          )}

          {needsSubclass && (
            <section className="bg-purple-50 border border-purple-300 rounded-lg p-3">
              <h3 className="font-bold text-sm mb-2">Elegir subclase</h3>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {subclassOptions.map((s) => (
                  <label
                    key={s.id}
                    className={`block p-2 rounded border cursor-pointer text-sm ${
                      subclassId === s.id
                        ? 'border-purple-600 bg-purple-100'
                        : 'border-ink-200 bg-white'
                    }`}
                  >
                    <input
                      type="radio"
                      name="subclass"
                      className="mr-2"
                      checked={subclassId === s.id}
                      onChange={() => setSubclassId(s.id)}
                    />
                    <strong>{s.name}</strong>
                    <p className="text-xs text-ink-600 ml-5">{s.description}</p>
                  </label>
                ))}
              </div>
            </section>
          )}

          {featuresGained.length > 0 && (
            <section className="bg-white border border-ink-200 rounded-lg p-3">
              <h3 className="font-bold text-sm mb-2">Nuevos rasgos de clase</h3>
              <ul className="space-y-2 text-sm">
                {featuresGained.map((f) => {
                  const cKey = inferChoiceKey(f);
                  const catalog = cKey ? getChoiceCatalog(cKey) : [];
                  const multi =
                    cKey === 'metamagic' || cKey === 'maneuvers' || cKey === 'invocation';
                  return (
                    <li key={f.id} className="border border-ink-100 rounded p-2">
                      <div className="flex flex-wrap gap-2 items-start min-w-0">
                        <strong className="flex-1 min-w-0 break-words">{f.name}</strong>
                        <span className="text-[10px] bg-ink-100 px-1 rounded">Niv. {f.level}</span>
                      </div>
                      <p className="text-xs text-ink-600 mt-0.5 break-words whitespace-pre-wrap">{f.description}</p>
                      {(catalog.length > 0) && (
                        <div className="mt-1 bg-amber-50 border border-amber-200 rounded p-1.5">
                          <p className="text-[10px] font-bold text-amber-900">
                            {cKey
                              ? CHOICE_CATALOG_LABELS[cKey] || 'Elección'
                              : f.choiceHint || 'Elección'}
                          </p>
                          {catalog.length > 0 ? (
                            <div className="max-h-32 overflow-y-auto space-y-0.5 mt-1">
                              {catalog.map((opt: TableOption) => {
                                const selected = (catalogPicks[f.id] || []).includes(opt.id);
                                return (
                                  <label
                                    key={opt.id}
                                    className={`flex gap-1.5 text-[11px] cursor-pointer rounded px-1 ${
                                      selected ? 'bg-amber-100' : ''
                                    }`}
                                  >
                                    <input
                                      type={multi ? 'checkbox' : 'radio'}
                                      name={`m-${f.id}`}
                                      checked={selected}
                                      onChange={() => toggleCatalogPick(f.id, opt.id, multi)}
                                      className="mt-0.5"
                                    />
                                    <span>
                                      <strong>{opt.name}</strong>
                                      {opt.description && (
                                        <span className="text-ink-600"> — {opt.description}</span>
                                      )}
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                          ) : null}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {subclassFeaturesGained.length > 0 && (
            <section className="bg-purple-50 border border-purple-200 rounded-lg p-3">
              <h3 className="font-bold text-sm mb-2">Nuevos rasgos de subclase</h3>
              <ul className="space-y-2 text-sm">
                {subclassFeaturesGained.map((f) => {
                  const cKey = inferChoiceKey(f);
                  const catalog = cKey ? getChoiceCatalog(cKey) : [];
                  const multi =
                    cKey === 'metamagic' || cKey === 'maneuvers' || cKey === 'invocation';
                  return (
                    <li key={f.id} className="bg-white border border-purple-100 rounded p-2">
                      <strong>{f.name}</strong>
                      <span className="text-[10px] ml-2 bg-purple-100 px-1 rounded">
                        Niv. {f.level}
                      </span>
                      <p className="text-xs text-ink-600 break-words whitespace-pre-wrap">{f.description}</p>
                      {(catalog.length > 0) && (
                        <div className="mt-1">
                          {catalog.length > 0 ? (
                            <div className="max-h-28 overflow-y-auto space-y-0.5">
                              {catalog.map((opt: TableOption) => {
                                const selected = (catalogPicks[f.id] || []).includes(opt.id);
                                return (
                                  <label
                                    key={opt.id}
                                    className={`flex gap-1.5 text-[11px] cursor-pointer ${
                                      selected ? 'bg-purple-100' : ''
                                    }`}
                                  >
                                    <input
                                      type={multi ? 'checkbox' : 'radio'}
                                      name={`ms-${f.id}`}
                                      checked={selected}
                                      onChange={() => toggleCatalogPick(f.id, opt.id, multi)}
                                    />
                                    <span>
                                      <strong>{opt.name}</strong> — {opt.description}
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                          ) : null}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {needsAsi && (
            <section className="bg-amber-50 border border-amber-300 rounded-lg p-3">
              <h3 className="font-bold text-sm mb-1">Mejora de característica (ASI)</h3>
              <p className="text-xs text-ink-600 mb-2">
                Niveles ASI: {asiLevelsCrossed.join(', ')}. Distribuye{' '}
                <strong>{totalAsiBudget}</strong> puntos. Gastados: {asiSpent}/{totalAsiBudget}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {ABILITIES.map((ab) => (
                  <div key={ab} className="flex items-center gap-1 bg-white border rounded px-2 py-1">
                    <span className="text-xs font-bold w-8">{ABILITY_LABELS[ab]}</span>
                    <span className="text-xs font-mono">
                      {character.abilityScores[ab] + (asi[ab] || 0)}
                    </span>
                    <button
                      type="button"
                      onClick={() => applyAsiPoint(ab, -1)}
                      className="ml-auto px-1 border rounded text-xs"
                    >
                      −
                    </button>
                    <button
                      type="button"
                      onClick={() => applyAsiPoint(ab, 1)}
                      className="px-1 border rounded text-xs"
                    >
                      +
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 border-2 border-ink-400 rounded-lg font-bold"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={targetLevel === character.level && !needsSubclass}
              className="flex-1 py-2.5 bg-crimson-700 text-white rounded-lg font-bold disabled:opacity-40"
            >
              Aplicar nivel {targetLevel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
