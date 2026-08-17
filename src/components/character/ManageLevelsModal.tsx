import { useMemo, useState } from 'react';
import type { AbilityScore, AbilityScores, Character, PendingChoice } from '../../types/dnd';
import { ABILITY_LABELS } from '../../types/dnd';
import { useClasses } from '../../hooks/useClasses';
import { useRaces } from '../../hooks/useRaces';
import {
  SUBCLASSES,
  isAsiLevel,
  hitDieNumber,
  setCharacterLevel,
} from '../../utils/characterBuilder';
import { getModifier, formatModifier } from '../../utils/character';
import { X, TrendingUp, TrendingDown } from 'lucide-react';

interface Props {
  character: Character;
  onConfirm: (character: Character) => void;
  onClose: () => void;
}

const ABILITIES: AbilityScore[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

/**
 * Gestionar niveles (estilo D&D Beyond):
 * - Elegir nivel objetivo (subir o bajar)
 * - ASI / subclase / rasgos que requieran elección al subir
 * - Al bajar, se retiran rasgos de niveles superiores
 */
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
  const [hpMode, setHpMode] = useState<'avg' | 'roll'>('avg');
  const die = hitDieNumber(classData?.hitDie || 'd8');
  const avgHp = Math.floor(die / 2) + 1;
  const conMod = getModifier(character.abilityScores.con);
  const [rolledHp, setRolledHp] = useState(avgHp);
  const [asi, setAsi] = useState<Partial<AbilityScores>>({});
  const [subclassId, setSubclassId] = useState(character.subclassId || '');
  const [choiceNotes, setChoiceNotes] = useState<Record<string, string>>({});

  const goingUp = targetLevel > character.level;
  const goingDown = targetLevel < character.level;
  const singleStepUp = targetLevel === character.level + 1;

  const subclassOptions = classData?.subclasses?.length
    ? classData.subclasses
    : classData
    ? SUBCLASSES[classData.id] || []
    : [];

  const subclassLevel =
    classData?.features.find((f) =>
      /subclase|arquetipo|camino|colegio|dominio|juramento|círculo|tradici[oó]n|origen|patr[oó]n|senda/i.test(
        f.name
      )
    )?.level || 3;

  const effectiveSubclassId = subclassId || character.subclassId;
  const needsSubclass =
    goingUp &&
    !effectiveSubclassId &&
    subclassOptions.length > 0 &&
    targetLevel >= subclassLevel;

  const levelsGained = useMemo(() => {
    if (!goingUp) return [] as number[];
    const out: number[] = [];
    for (let l = character.level + 1; l <= targetLevel; l++) out.push(l);
    return out;
  }, [character.level, targetLevel, goingUp]);

  const featuresGained = useMemo(() => {
    if (!classData || !goingUp) return [];
    return classData.features.filter((f) => levelsGained.includes(f.level));
  }, [classData, levelsGained, goingUp]);

  const subclassFeaturesGained = useMemo(() => {
    if (!goingUp || !effectiveSubclassId) return [];
    const sub =
      subclassOptions.find((s) => s.id === effectiveSubclassId) ||
      classData?.subclasses?.find((s) => s.id === effectiveSubclassId);
    if (!sub) return [];
    return sub.features.filter((f) => levelsGained.includes(f.level));
  }, [goingUp, effectiveSubclassId, subclassOptions, classData, levelsGained]);

  const asiLevelsHit = levelsGained.filter((l) => isAsiLevel(l));
  const asiBudget = asiLevelsHit.length * 2;
  const asiSpent = Object.values(asi).reduce((s, v) => s + (v || 0), 0);

  const hpGainOne =
    Math.max(1, (hpMode === 'avg' ? avgHp : rolledHp) + conMod);

  const applyAsiPoint = (ability: AbilityScore, delta: number) => {
    setAsi((prev) => {
      const current = prev[ability] || 0;
      const next = Math.max(0, current + delta);
      const others = Object.entries(prev)
        .filter(([k]) => k !== ability)
        .reduce((s, [, v]) => s + (v || 0), 0);
      if (others + next > asiBudget) return prev;
      if (character.abilityScores[ability] + next > 20) return prev;
      return { ...prev, [ability]: next || undefined };
    });
  };

  const handleConfirm = () => {
    if (targetLevel === character.level && subclassId === (character.subclassId || '')) {
      onClose();
      return;
    }
    if (goingUp && asiBudget > 0 && asiSpent !== asiBudget) {
      alert(`Debes distribuir exactamente ${asiBudget} puntos de característica (ASI).`);
      return;
    }
    if (needsSubclass && !subclassId) {
      alert('Debes elegir una subclase.');
      return;
    }

    const sub = subclassOptions.find((s) => s.id === subclassId);
    let updated = setCharacterLevel(character, classData, raceData, targetLevel, {
      hpGain: singleStepUp ? hpGainOne : undefined,
      asi: goingUp && asiBudget > 0 ? asi : undefined,
      subclassId: subclassId || character.subclassId,
      subclassName: sub?.name || character.subclass,
    });

    // Pending choices for new features that require selection
    if (goingUp) {
      const pending: PendingChoice[] = [...(character.pendingChoices || [])].filter(
        (p) => !p.levelGained || p.levelGained <= targetLevel
      );
      const notes: string[] = [];
      for (const f of [...featuresGained, ...subclassFeaturesGained]) {
        if (!f.requiresChoice) continue;
        const answer = choiceNotes[f.id]?.trim();
        if (answer) {
          notes.push(`${f.name}: ${answer}`);
          updated = {
            ...updated,
            features: updated.features.map((feat) =>
              feat.id === f.id || feat.name === f.name
                ? { ...feat, description: `${feat.description}\n\nElección: ${answer}` }
                : feat
            ),
          };
        } else if (!pending.some((p) => p.featureId === f.id && !p.resolution)) {
          pending.push({
            id: crypto.randomUUID(),
            featureId: f.id,
            featureName: f.name,
            description: f.description,
            choiceHint: f.choiceHint,
            levelGained: f.level,
            source: f.source || 'class',
          });
        }
      }
      updated = {
        ...updated,
        pendingChoices: pending.filter((p) => (p.levelGained || 0) <= targetLevel),
      };
      if (notes.length) {
        updated = {
          ...updated,
          notes: [updated.notes || '', '— Elecciones al cambiar de nivel —', ...notes]
            .filter(Boolean)
            .join('\n'),
        };
      }
    } else if (goingDown) {
      // Drop pending choices above new level
      updated = {
        ...updated,
        pendingChoices: (character.pendingChoices || []).filter(
          (p) => (p.levelGained || 0) <= targetLevel
        ),
      };
    }

    onConfirm(updated);
  };

  const featuresLost =
    goingDown && classData
      ? classData.features.filter((f) => f.level > targetLevel && f.level <= character.level)
      : [];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 pb-24 sm:p-4 sm:pb-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-parchment-50 border-2 border-ink-900 rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] overflow-y-auto">
        <div className="sticky top-0 bg-ink-900 text-parchment-50 px-4 py-3 flex items-center justify-between rounded-t-xl z-10">
          <h2 className="font-display font-bold text-lg">Gestionar niveles</h2>
          <button type="button" onClick={onClose} className="p-1 hover:bg-ink-700 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <section className="bg-white border-2 border-ink-200 rounded-xl p-3">
            <div className="text-sm text-ink-600 mb-2">
              Nivel actual: <strong>{character.level}</strong>
              {character.subclass && (
                <span className="text-ink-500"> · {character.subclass}</span>
              )}
            </div>
            <label className="block text-sm font-bold mb-1">Nivel objetivo</label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="w-10 h-10 rounded-lg bg-ink-200 font-bold text-lg disabled:opacity-40"
                disabled={targetLevel <= 1}
                onClick={() => setTargetLevel((l) => Math.max(1, l - 1))}
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
                className="w-20 text-center text-2xl font-bold border-2 border-ink-800 rounded-lg py-1"
              />
              <button
                type="button"
                className="w-10 h-10 rounded-lg bg-ink-200 font-bold text-lg disabled:opacity-40"
                disabled={targetLevel >= 20}
                onClick={() => setTargetLevel((l) => Math.min(20, l + 1))}
              >
                +
              </button>
              {goingUp && (
                <span className="flex items-center gap-1 text-green-700 text-sm font-medium">
                  <TrendingUp className="w-4 h-4" /> Subir
                </span>
              )}
              {goingDown && (
                <span className="flex items-center gap-1 text-amber-700 text-sm font-medium">
                  <TrendingDown className="w-4 h-4" /> Bajar
                </span>
              )}
            </div>
            <p className="text-xs text-ink-500 mt-2">
              Como en D&amp;D Beyond: puedes subir o bajar de nivel. Al bajar se eliminan rasgos,
              espacios y recursos de los niveles superiores.
            </p>
          </section>

          {singleStepUp && (
            <section className="bg-white border-2 border-ink-200 rounded-xl p-3">
              <h3 className="font-bold text-sm mb-2">Puntos de golpe (+1 nivel)</h3>
              <div className="flex gap-2 mb-2">
                <button
                  type="button"
                  onClick={() => setHpMode('avg')}
                  className={`px-3 py-1 rounded-lg text-sm border-2 ${
                    hpMode === 'avg' ? 'border-crimson-600 bg-crimson-50 font-bold' : 'border-ink-200'
                  }`}
                >
                  Promedio ({avgHp})
                </button>
                <button
                  type="button"
                  onClick={() => setHpMode('roll')}
                  className={`px-3 py-1 rounded-lg text-sm border-2 ${
                    hpMode === 'roll' ? 'border-crimson-600 bg-crimson-50 font-bold' : 'border-ink-200'
                  }`}
                >
                  Tirar {classData?.hitDie || 'd8'}
                </button>
              </div>
              {hpMode === 'roll' && (
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="number"
                    min={1}
                    max={die}
                    value={rolledHp}
                    onChange={(e) =>
                      setRolledHp(Math.min(die, Math.max(1, parseInt(e.target.value) || 1)))
                    }
                    className="w-16 px-2 py-1 border rounded text-center"
                  />
                  <button
                    type="button"
                    onClick={() => setRolledHp(Math.floor(Math.random() * die) + 1)}
                    className="text-xs px-2 py-1 bg-ink-200 rounded"
                  >
                    Aleatorio
                  </button>
                </div>
              )}
              <p className="text-sm">
                Ganancia: <strong>+{hpGainOne}</strong> (dado + Con {formatModifier(conMod)})
              </p>
            </section>
          )}

          {goingUp && !singleStepUp && (
            <p className="text-xs bg-amber-50 border border-amber-200 rounded-lg p-2">
              Al subir varios niveles de golpe, los PG se recalculan con el promedio de dados
              (+ Con) por cada nivel.
            </p>
          )}

          {goingDown && (
            <section className="bg-amber-50 border border-amber-300 rounded-xl p-3 text-sm">
              <h3 className="font-bold mb-1">Al bajar al nivel {targetLevel}</h3>
              <ul className="list-disc pl-5 text-xs space-y-1">
                <li>Se recalculan PG máximos (promedio), espacios de conjuro y bonificador de competencia.</li>
                <li>Se retiran rasgos de clase/subclase de niveles superiores a {targetLevel}.</li>
                {featuresLost.length > 0 && (
                  <li>
                    Rasgos de clase que se pierden:{' '}
                    {featuresLost.map((f) => f.name).join(', ')}
                  </li>
                )}
              </ul>
            </section>
          )}

          {goingUp && featuresGained.length > 0 && (
            <section className="bg-white border-2 border-ink-200 rounded-xl p-3">
              <h3 className="font-bold text-sm mb-2">Rasgos de clase que obtienes</h3>
              <ul className="space-y-2">
                {featuresGained.map((f) => (
                  <li key={f.id} className="text-sm border border-ink-100 rounded p-2">
                    <strong>
                      {f.name}{' '}
                      <span className="text-ink-500 font-normal">(niv. {f.level})</span>
                    </strong>
                    <p className="text-xs text-ink-600 mt-0.5">{f.description}</p>
                    {f.requiresChoice && (
                      <input
                        placeholder={f.choiceHint || 'Anota tu elección…'}
                        value={choiceNotes[f.id] || ''}
                        onChange={(e) =>
                          setChoiceNotes((prev) => ({ ...prev, [f.id]: e.target.value }))
                        }
                        className="mt-1 w-full px-2 py-1 border border-amber-300 rounded text-xs bg-amber-50"
                      />
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {goingUp && (needsSubclass || subclassOptions.length > 0) && targetLevel >= subclassLevel && (
            <section className="bg-purple-50 border border-purple-300 rounded-xl p-3">
              <h3 className="font-bold text-sm mb-2">
                {needsSubclass ? 'Elige subclase' : 'Subclase'}
              </h3>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {subclassOptions.map((s) => (
                  <label
                    key={s.id}
                    className={`flex items-start gap-2 p-2 rounded-lg border-2 cursor-pointer text-sm ${
                      subclassId === s.id
                        ? 'border-crimson-600 bg-white'
                        : 'border-transparent bg-white/60 hover:border-ink-200'
                    }`}
                  >
                    <input
                      type="radio"
                      name="subclass"
                      checked={subclassId === s.id}
                      onChange={() => setSubclassId(s.id)}
                    />
                    <span>
                      <strong>{s.name}</strong>
                      <span className="block text-xs text-ink-600">{s.description}</span>
                    </span>
                  </label>
                ))}
              </div>
            </section>
          )}

          {goingUp && subclassFeaturesGained.length > 0 && (
            <section className="bg-purple-50 border border-purple-200 rounded-xl p-3">
              <h3 className="font-bold text-sm mb-2">Rasgos de subclase</h3>
              <ul className="space-y-2">
                {subclassFeaturesGained.map((f) => (
                  <li key={f.id} className="text-sm bg-white rounded p-2 border border-purple-100">
                    <strong>
                      {f.name} <span className="text-ink-500 font-normal">(niv. {f.level})</span>
                    </strong>
                    <p className="text-xs text-ink-600">{f.description}</p>
                    {f.requiresChoice && (
                      <input
                        placeholder={f.choiceHint || 'Anota tu elección…'}
                        value={choiceNotes[f.id] || ''}
                        onChange={(e) =>
                          setChoiceNotes((prev) => ({ ...prev, [f.id]: e.target.value }))
                        }
                        className="mt-1 w-full px-2 py-1 border border-amber-300 rounded text-xs bg-amber-50"
                      />
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {goingUp && asiBudget > 0 && (
            <section className="bg-white border-2 border-ink-200 rounded-xl p-3">
              <h3 className="font-bold text-sm mb-1">
                Mejora de característica (ASI)
              </h3>
              <p className="text-xs text-ink-600 mb-2">
                Niveles {asiLevelsHit.join(', ')} · Distribuye {asiBudget} puntos
                (gastados {asiSpent}/{asiBudget})
              </p>
              <div className="grid grid-cols-3 gap-2">
                {ABILITIES.map((a) => (
                  <div key={a} className="text-center border rounded-lg p-2">
                    <div className="text-[10px] uppercase font-bold">{ABILITY_LABELS[a]}</div>
                    <div className="text-sm">
                      {character.abilityScores[a]}
                      {(asi[a] || 0) > 0 && (
                        <span className="text-green-700"> +{asi[a]}</span>
                      )}
                    </div>
                    <div className="flex justify-center gap-1 mt-1">
                      <button
                        type="button"
                        className="w-7 h-7 bg-ink-200 rounded"
                        onClick={() => applyAsiPoint(a, -1)}
                      >
                        −
                      </button>
                      <button
                        type="button"
                        className="w-7 h-7 bg-ink-200 rounded"
                        onClick={() => applyAsiPoint(a, 1)}
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        <div className="sticky bottom-0 bg-parchment-100 border-t-2 border-ink-200 px-4 py-3 flex gap-2 rounded-b-xl">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2 border-2 border-ink-300 rounded-lg text-sm font-medium"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="flex-1 py-2 bg-crimson-600 text-white rounded-lg text-sm font-bold hover:bg-crimson-700"
          >
            Aplicar nivel {targetLevel}
          </button>
        </div>
      </div>
    </div>
  );
}
