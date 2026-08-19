import { useState, useMemo } from 'react';
import type { AbilityScore, AbilityScores, Character } from '../../types/dnd';
import { ABILITY_LABELS, SKILLS } from '../../types/dnd';
import { useRaces } from '../../hooks/useRaces';
import { useClasses } from '../../hooks/useClasses';
import { useBackgrounds } from '../../hooks/useBackgrounds';
import { useSpells } from '../../hooks/useSpells';
import {
  STANDARD_ARRAY,
  POINT_BUY_COST,
  pointBuyTotal,
  buildCharacterFromWizard,
  countExtraLanguageChoices,
  COMMON_LANGUAGES,
  CLASS_SKILL_OPTIONS,
} from '../../utils/characterBuilder';
import { ALIGNMENTS, getAlignmentInfo } from '../../utils/alignments';
import { expandStartingOption, expandPackItems, packSummary } from '../../utils/equipmentPacks';
import {
  needsWeaponPick,
  weaponsForChoice,
  weaponPickCount,
  type WeaponPick,
} from '../../data/weaponCatalog';
import { applyFeatureSpellGrants } from '../../utils/featureSpellGrants';
import startingEquipment from '../../data/starting-equipment.json';
import type { InventoryItem } from '../../types/dnd';
import { getModifier, formatModifier } from '../../utils/character';
import { formatSpeed } from '../../utils/units';
import {
  ChevronRight,
  ChevronLeft,
  Check,
  Sparkles,
  User,
  Swords,
  BookOpen,
  Dices,
  Backpack,
  ScrollText,
} from 'lucide-react';

const ABILITIES: AbilityScore[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

/** Descripción breve de qué hace cada habilidad (PHB) */
const SKILL_HELP: Record<string, string> = {
  Acrobacias: 'Mantener el equilibrio, volteretas, aterrizajes y maniobras ágiles (Des).',
  'Trato con Animales': 'Calmar, leer o manejar animales (Sab).',
  Arcanos: 'Conocimiento de magia, objetos mágicos, símbolos y planos (Int).',
  Atletismo: 'Trepar, saltar, nadar y proezas de fuerza (Fue).',
  Engaño: 'Mentir, disimular o engañar con palabras o apariencia (Car).',
  Historia: 'Hechos del pasado, civilizaciones, guerras y leyendas (Int).',
  Perspicacia: 'Leer intenciones, detectar mentiras o estados de ánimo (Sab).',
  Intimidación: 'Influir mediante amenazas, presencia o coacción (Car).',
  Investigación: 'Buscar pistas, deducir y examinar detalles (Int).',
  Medicina: 'Diagnosticar, estabilizar y tratar heridas (Sab).',
  Naturaleza: 'Terreno, plantas, animales, clima y ciclos naturales (Int).',
  Percepción: 'Detectar presencias, sonidos, olores y detalles ocultos (Sab).',
  Interpretación: 'Actuar, cantar, bailar u otras artes ante un público (Car).',
  Persuasión: 'Convencer con tacto, diplomacia o buenos argumentos (Car).',
  Religión: 'Ritos, deidades, cultos y lore sagrado (Int).',
  'Juego de Manos': 'Hurtar, escamotear o manipular objetos con discreción (Des).',
  Sigilo: 'Esconderse, moverse en silencio y pasar desapercibido (Des).',
  Supervivencia: 'Rastrear, orientarse, cazar y vivir en la naturaleza (Sab).',
};

function skillAbilityLabel(skillName: string): string {
  const sk = SKILLS.find(
    (s) => s.name.toLowerCase() === skillName.toLowerCase()
  );
  return sk ? ABILITY_LABELS[sk.ability] : '';
}

function formatItemList(name: string): string | null {
  const summary = packSummary(name);
  if (summary) return summary;
  const items = expandPackItems(name);
  if (items?.length) {
    return items
      .map((i) => (i.quantity && i.quantity > 1 ? `${i.name} ×${i.quantity}` : i.name))
      .join(', ');
  }
  return null;
}


interface Props {
  onComplete: (character: Character) => void;
  onCancel: () => void;
}

/** Orden D&D Beyond 2024: Class → Background → Species → Abilities → Equipment → Details */
type Step =
  | 'class'
  | 'background'
  | 'species'
  | 'abilities'
  | 'skills'
  | 'equipment'
  | 'details'
  | 'review';

const STEPS: { id: Step; label: string; icon: typeof Swords }[] = [
  { id: 'class', label: 'Clase', icon: Swords },
  { id: 'background', label: 'Trasfondo', icon: BookOpen },
  { id: 'species', label: 'Especie', icon: User },
  { id: 'abilities', label: 'Atributos', icon: Dices },
  { id: 'skills', label: 'Habilidades', icon: Sparkles },
  { id: 'equipment', label: 'Equipo', icon: Backpack },
  { id: 'details', label: 'Detalles', icon: ScrollText },
  { id: 'review', label: 'Resumen', icon: Check },
];

export function CharacterWizard({ onComplete, onCancel }: Props) {
  const { races } = useRaces();
  const { classes } = useClasses();
  const { backgrounds } = useBackgrounds();
  const { spells: spellCatalog } = useSpells();

  const [step, setStep] = useState<Step>('class');
  const [name, setName] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [alignment, setAlignment] = useState('');
  const [raceId, setRaceId] = useState<string | null>(null);
  const [classId, setClassId] = useState<string | null>(null);
  const [subclassId, setSubclassId] = useState<string | null>(null);
  const [backgroundId, setBackgroundId] = useState<string | null>(null);
  const [originFeatId, setOriginFeatId] = useState<string | null>(null);
  const [abilityMode, setAbilityMode] = useState<'pointbuy' | 'array' | 'manual'>('pointbuy');
  const [baseScores, setBaseScores] = useState<AbilityScores>({
    str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8,
  });
  const [arrayAssign, setArrayAssign] = useState<Partial<Record<AbilityScore, number>>>({});
  const [chosenClassSkills, setChosenClassSkills] = useState<string[]>([]);
  const [chosenLanguages, setChosenLanguages] = useState<string[]>([]);
  const [equipMode, setEquipMode] = useState<'pack' | 'gold'>('pack');
  const [equipChoices, setEquipChoices] = useState<Record<string, number>>({});
  const [weaponPicks, setWeaponPicks] = useState<Record<string, string[]>>({});
  const [search, setSearch] = useState('');

  const race = races.find((r) => r.id === raceId) || null;
  const classData = classes.find((c) => c.id === classId) || null;
  const background = backgrounds.find((b) => b.id === backgroundId) || null;
  const subclasses = classData?.subclasses || [];
  const subclass = subclasses.find((s) => s.id === subclassId) || null;

  const originFeatOptions = useMemo(() => {
    if (!background) return [];
    if (background.originFeatChoices?.length) return background.originFeatChoices;
    if (background.originFeat)
      return [{
        id: background.originFeat.name.toLowerCase().replace(/\s+/g, '-'),
        name: background.originFeat.name,
        description: background.originFeat.description,
      }];
    return [];
  }, [background]);

  const selectedOriginFeat = originFeatOptions.find((f) => f.id === originFeatId) || null;
  const stepIndex = STEPS.findIndex((s) => s.id === step);
  const skillOpts = classId ? CLASS_SKILL_OPTIONS[classId] : null;

  const langNeed = useMemo(() => {
    if (!race) return 0;
    return countExtraLanguageChoices(race, background?.languages);
  }, [race, background]);

  const canNext = (): boolean => {
    switch (step) {
      case 'class': return !!classId;
      case 'background': return !!backgroundId && (originFeatOptions.length === 0 || !!originFeatId);
      case 'species': return !!raceId;
      case 'abilities':
        if (abilityMode === 'pointbuy') return pointBuyTotal(baseScores) <= 27;
        if (abilityMode === 'array') {
          const used = Object.values(arrayAssign);
          return used.length === 6 && new Set(used).size === 6;
        }
        return true;
      case 'skills': {
        if (!skillOpts) return langNeed === 0 || chosenLanguages.filter(Boolean).length >= langNeed;
        const okSkills = chosenClassSkills.length >= skillOpts.count;
        const okLang = chosenLanguages.filter(Boolean).length >= langNeed;
        return okSkills && okLang;
      }
      case 'equipment': {
        if (!classId || equipMode === 'gold') return true;
        const pack = (startingEquipment as any)[classId];
        if (!pack?.choices?.length) return true;
        if (!pack.choices.every((c: any) => equipChoices[c.id] !== undefined)) return false;
        for (const c of pack.choices) {
          const opt = c.options[equipChoices[c.id]];
          if (opt && needsWeaponPick(opt.name || '')) {
            const need = weaponPickCount(opt.name || '');
            const got = (weaponPicks[c.id] || []).filter(Boolean).length;
            if (got < need) return false;
          }
        }
        return true;
      }
      case 'details': return name.trim().length > 0;
      case 'review': return true;
      default: return false;
    }
  };

  const goNext = () => {
    if (step === 'abilities' && abilityMode === 'array') {
      const scores = { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 } as AbilityScores;
      ABILITIES.forEach((a) => {
        if (arrayAssign[a] !== undefined) scores[a] = arrayAssign[a]!;
      });
      setBaseScores(scores);
    }
    if (step === 'review') { finish(); return; }
    const next = STEPS[stepIndex + 1];
    if (next) { setSearch(''); setStep(next.id); }
  };

  const goBack = () => {
    if (stepIndex === 0) { onCancel(); return; }
    setSearch('');
    setStep(STEPS[stepIndex - 1].id);
  };

  const finish = () => {
    if (!race || !classData || !background) return;
    let scores = baseScores;
    if (abilityMode === 'array') {
      scores = { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 };
      ABILITIES.forEach((a) => {
        if (arrayAssign[a] !== undefined) scores[a] = arrayAssign[a]!;
      });
    }

    const pack = (startingEquipment as any)[classData.id];
    let customInventory: InventoryItem[] | undefined;
    let startingGold = 0;

    if (pack && equipMode === 'gold') {
      customInventory = [];
      startingGold = pack.goldAlternative ?? pack.gold ?? 0;
    } else if (pack) {
      const items: InventoryItem[] = [];
      const pushItem = (raw: any) => {
        const expanded = expandStartingOption(raw);
        for (const part of expanded) {
          items.push({
            ...part,
            id: crypto.randomUUID(),
            quantity: part.quantity || 1,
            proficient: part.proficient ?? !!part.damage,
            properties: part.properties,
            armorClass: part.armorClass,
            armorDexMod: part.armorDexMod,
            equipped: part.equipped ?? false,
            description: part.description,
            damage: part.damage,
            damageType: part.damageType,
            name: part.name,
          });
        }
      };
      if (pack.fixed) for (const f of pack.fixed) pushItem(f);
      for (const c of pack.choices || []) {
        const idx = equipChoices[c.id];
        if (idx === undefined) continue;
        const opt = c.options[idx];
        if (!opt) continue;
        if (needsWeaponPick(opt.name || '')) {
          const picks = weaponPicks[c.id] || [];
          for (const pickName of picks.filter(Boolean)) {
            const w = weaponsForChoice(opt.name || '').find((x) => x.name === pickName);
            if (w) {
              items.push({
                id: crypto.randomUUID(),
                name: w.name,
                quantity: 1,
                damage: w.damage,
                damageType: w.damageType,
                properties: w.properties,
                proficient: true,
                equipped: true,
              });
            }
          }
        } else {
          pushItem(opt);
        }
      }
      customInventory = items;
    }

    let char = buildCharacterFromWizard({
      name: name.trim(),
      playerName: playerName.trim() || undefined,
      race,
      classData,
      subclassName: subclass?.name,
      subclassId: subclass?.id,
      background: background.name,
      backgroundData: background,
      originFeat: selectedOriginFeat,
      alignment: alignment || undefined,
      baseScores: scores,
      chosenLanguages: chosenLanguages.filter(Boolean),
      chosenSkills: chosenClassSkills,
      customInventory,
      startingGold,
    });

    char = applyFeatureSpellGrants(char, spellCatalog);
    onComplete(char);
  };

  const setScore = (ability: AbilityScore, value: number) => {
    const max = abilityMode === 'manual' ? 20 : 15;
    setBaseScores((prev) => ({ ...prev, [ability]: Math.min(max, Math.max(8, value)) }));
  };

  const toggleSkill = (skillName: string) => {
    setChosenClassSkills((prev) => {
      if (prev.includes(skillName)) return prev.filter((s) => s !== skillName);
      if (!skillOpts) return [...prev, skillName];
      if (prev.length >= skillOpts.count) return prev;
      return [...prev, skillName];
    });
  };

  const filterList = <T extends { name: string; description?: string }>(list: T[]) => {
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(
      (x) => x.name.toLowerCase().includes(q) || (x.description || '').toLowerCase().includes(q)
    );
  };

  const PreviewPanel = () => (
    <div className="bg-ink-900 text-parchment-100 rounded-xl p-4 sticky top-4 space-y-3 text-sm">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-full bg-ink-700 border-2 border-crimson-600 flex items-center justify-center text-lg font-display font-bold">
          {(name || '?')[0].toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="font-display font-bold truncate">{name || 'Sin nombre'}</div>
          <div className="text-parchment-400 text-xs truncate">
            {[race?.name, classData?.name, subclass?.name].filter(Boolean).join(' · ') || 'Elige opciones'}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="bg-ink-800 rounded-lg p-2">
          <div className="text-parchment-500 uppercase text-[10px]">Trasfondo</div>
          <div className="font-medium truncate">{background?.name || '—'}</div>
        </div>
        <div className="bg-ink-800 rounded-lg p-2">
          <div className="text-parchment-500 uppercase text-[10px]">Dote origen</div>
          <div className="font-medium truncate">{selectedOriginFeat?.name || '—'}</div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-1">
        {ABILITIES.map((a) => (
          <div key={a} className="bg-ink-800 rounded p-1.5 text-center">
            <div className="text-[9px] uppercase text-parchment-500">{ABILITY_LABELS[a].slice(0, 3)}</div>
            <div className="font-bold">{baseScores[a]}</div>
            <div className="text-[10px] text-parchment-400">{formatModifier(getModifier(baseScores[a]))}</div>
          </div>
        ))}
      </div>
      {race && (
        <div className="text-xs text-parchment-400">
          Velocidad {formatSpeed(race.speed)} · Tamaño {race.size}
        </div>
      )}
      {classData && (
        <div className="text-xs text-parchment-400">
          Dado de golpe {classData.hitDie} · Salv. {classData.savingThrows.join(', ')}
        </div>
      )}
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto">
      <div className="bg-ink-900 text-parchment-50 rounded-t-xl p-4">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h1 className="text-xl font-display font-bold">Crear personaje</h1>
          <span className="text-xs text-parchment-400">PHB 2024 · estilo D&amp;D Beyond</span>
        </div>
        <div className="flex flex-wrap gap-1">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => i <= stepIndex && setStep(s.id)}
                className={`flex items-center gap-1 text-xs px-2 py-1.5 rounded-lg transition ${
                  i === stepIndex
                    ? 'bg-crimson-600 text-white'
                    : i < stepIndex
                    ? 'bg-ink-700 text-parchment-200 hover:bg-ink-600'
                    : 'bg-ink-800 text-ink-500 cursor-default'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{s.label}</span>
                <span className="sm:hidden">{i + 1}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="bg-parchment-50 border-2 border-t-0 border-ink-800 rounded-b-xl p-4 sm:p-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 min-h-[340px]">
            {step === 'class' && (
              <div className="space-y-4">
                <div>
                  <h2 className="font-display font-bold text-lg">Elige tu clase</h2>
                  <p className="text-sm text-ink-600">
                    En el PHB 2024 la creación empieza por la clase. Incluye clases homebrew del catálogo.
                  </p>
                </div>
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar clase…" className="w-full px-3 py-2 border-2 border-ink-300 rounded-lg" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[420px] overflow-y-auto">
                  {filterList(classes).map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setClassId(c.id);
                        setSubclassId(null);
                        setChosenClassSkills([]);
                        setEquipChoices({});
                        setWeaponPicks({});
                      }}
                      className={`text-left p-3 rounded-xl border-2 transition ${
                        classId === c.id ? 'border-crimson-600 bg-crimson-50' : 'border-ink-200 hover:border-ink-400 bg-white'
                      }`}
                    >
                      <div className="font-bold flex items-center gap-2">
                        {c.name}
                        {c.homebrew && <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-800">HB</span>}
                      </div>
                      <p className="text-xs text-ink-600 line-clamp-2 mt-1">{c.description}</p>
                      <p className="text-[10px] text-ink-500 mt-1">{c.hitDie} · {c.primaryAbility}</p>
                    </button>
                  ))}
                </div>
                {classData && subclasses.length > 0 && (
                  <div className="mt-4 border-t border-ink-200 pt-4">
                    <h3 className="font-bold text-sm mb-2">Subclase (opcional; muchas se eligen al nivel 3)</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <button type="button" onClick={() => setSubclassId(null)}
                        className={`text-left p-2 rounded-lg border-2 text-sm ${!subclassId ? 'border-crimson-600 bg-crimson-50' : 'border-ink-200'}`}>
                        Decidir más tarde
                      </button>
                      {subclasses.map((s) => (
                        <button key={s.id} type="button" onClick={() => setSubclassId(s.id)}
                          className={`text-left p-2 rounded-lg border-2 text-sm ${subclassId === s.id ? 'border-crimson-600 bg-crimson-50' : 'border-ink-200 hover:border-ink-400'}`}>
                          <div className="font-medium">{s.name}</div>
                          <p className="text-xs text-ink-600 line-clamp-2">{s.description}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {step === 'background' && (
              <div className="space-y-4">
                <div>
                  <h2 className="font-display font-bold text-lg">Origen · Trasfondo</h2>
                  <p className="text-sm text-ink-600">Trasfondos del catálogo (incl. homebrew) con dote de origen 2024.</p>
                </div>
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar trasfondo…" className="w-full px-3 py-2 border-2 border-ink-300 rounded-lg" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[320px] overflow-y-auto">
                  {filterList(backgrounds).map((b) => (
                    <button key={b.id} type="button"
                      onClick={() => {
                        setBackgroundId(b.id);
                        setOriginFeatId(
                          b.originFeatChoices?.[0]?.id ||
                          (b.originFeat ? b.originFeat.name.toLowerCase().replace(/\s+/g, '-') : null)
                        );
                      }}
                      className={`text-left p-3 rounded-xl border-2 transition ${
                        backgroundId === b.id ? 'border-crimson-600 bg-crimson-50' : 'border-ink-200 hover:border-ink-400 bg-white'
                      }`}>
                      <div className="font-bold flex items-center gap-2">
                        {b.name}
                        {b.homebrew && <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-800">HB</span>}
                      </div>
                      <p className="text-xs text-ink-600 line-clamp-2 mt-1">{b.description}</p>
                      {b.skillProficiencies && <p className="text-[10px] text-ink-500 mt-1">{b.skillProficiencies.join(', ')}</p>}
                    </button>
                  ))}
                </div>
                {background && originFeatOptions.length > 0 && (
                  <div className="border-t border-ink-200 pt-4">
                    <h3 className="font-bold text-sm mb-2">Dote de origen</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[200px] overflow-y-auto">
                      {originFeatOptions.map((f) => (
                        <button key={f.id} type="button" onClick={() => setOriginFeatId(f.id)}
                          className={`text-left p-2 rounded-lg border-2 text-sm ${originFeatId === f.id ? 'border-crimson-600 bg-crimson-50' : 'border-ink-200'}`}>
                          <div className="font-medium">{f.name}</div>
                          <p className="text-xs text-ink-600 line-clamp-2">{f.description}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {step === 'species' && (
              <div className="space-y-4">
                <div>
                  <h2 className="font-display font-bold text-lg">Especie</h2>
                  <p className="text-sm text-ink-600">Especies del PHB 2024 y homebrew del catálogo.</p>
                </div>
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar especie…" className="w-full px-3 py-2 border-2 border-ink-300 rounded-lg" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[420px] overflow-y-auto">
                  {filterList(races).map((r) => (
                    <button key={r.id} type="button"
                      onClick={() => { setRaceId(r.id); setChosenLanguages([]); }}
                      className={`text-left p-3 rounded-xl border-2 transition ${
                        raceId === r.id ? 'border-crimson-600 bg-crimson-50' : 'border-ink-200 hover:border-ink-400 bg-white'
                      }`}>
                      <div className="font-bold flex items-center gap-2">
                        {r.name}
                        {r.homebrew && <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-800">HB</span>}
                      </div>
                      <p className="text-xs text-ink-600 line-clamp-2 mt-1">{r.description}</p>
                      <p className="text-[10px] text-ink-500 mt-1">{formatSpeed(r.speed)} · {r.size} · {r.abilityScoreIncrease}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {step === 'abilities' && (
              <div className="space-y-4">
                <div>
                  <h2 className="font-display font-bold text-lg">Puntuaciones de característica</h2>
                  <p className="text-sm text-ink-600">Compra de puntos (27), array estándar o manual. Los bonos de especie se aplican al finalizar.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {([['pointbuy', 'Compra de puntos'], ['array', 'Array estándar'], ['manual', 'Manual']] as const).map(([id, label]) => (
                    <button key={id} type="button" onClick={() => setAbilityMode(id)}
                      className={`px-3 py-1.5 rounded-lg text-sm border-2 ${abilityMode === id ? 'border-crimson-600 bg-crimson-50 font-bold' : 'border-ink-200'}`}>
                      {label}
                    </button>
                  ))}
                </div>
                {abilityMode === 'pointbuy' && (
                  <p className="text-sm">Puntos usados:{' '}
                    <strong className={pointBuyTotal(baseScores) > 27 ? 'text-red-600' : ''}>{pointBuyTotal(baseScores)} / 27</strong>
                  </p>
                )}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {ABILITIES.map((a) => (
                    <div key={a} className="bg-white border-2 border-ink-800 rounded-xl p-3 text-center">
                      <div className="text-xs font-bold uppercase text-ink-600">{ABILITY_LABELS[a]}</div>
                      {abilityMode === 'array' ? (
                        <select
                          value={arrayAssign[a] ?? ''}
                          onChange={(e) => {
                            const v = parseInt(e.target.value, 10);
                            setArrayAssign((prev) => {
                              const next = { ...prev };
                              delete next[a];
                              if (!Number.isNaN(v)) next[a] = v;
                              return next;
                            });
                          }}
                          className="mt-2 w-full text-center text-xl font-bold border border-ink-300 rounded"
                        >
                          <option value="">—</option>
                          {STANDARD_ARRAY.map((n) => (
                            <option key={n} value={n}
                              disabled={Object.entries(arrayAssign).some(([k, val]) => k !== a && val === n)}>
                              {n}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <div className="flex items-center justify-center gap-2 mt-2">
                          <button type="button" className="w-8 h-8 rounded-lg bg-ink-200 font-bold" onClick={() => setScore(a, baseScores[a] - 1)}>−</button>
                          <span className="text-2xl font-bold w-10">{baseScores[a]}</span>
                          <button type="button" className="w-8 h-8 rounded-lg bg-ink-200 font-bold" onClick={() => setScore(a, baseScores[a] + 1)}>+</button>
                        </div>
                      )}
                      <div className="text-sm text-ink-500 mt-1">{formatModifier(getModifier(baseScores[a]))}</div>
                      {abilityMode === 'pointbuy' && (
                        <div className="text-[10px] text-ink-400">coste {POINT_BUY_COST[baseScores[a]] ?? '—'}</div>
                      )}
                    </div>
                  ))}
                </div>
                {race && (
                  <p className="text-xs text-ink-600 bg-amber-50 border border-amber-200 rounded-lg p-2">
                    Al crear se aplicará el aumento de especie: <em>{race.abilityScoreIncrease}</em>
                  </p>
                )}
              </div>
            )}

            {step === 'skills' && (
              <div className="space-y-4">
                <div>
                  <h2 className="font-display font-bold text-lg">Competencias e idiomas</h2>
                  <p className="text-sm text-ink-600">
                    Elige las habilidades de clase. Con competencia sumas tu bonificador de competencia
                    a las pruebas de esa habilidad. Las del trasfondo ya están incluidas.
                  </p>
                </div>
                {skillOpts && (
                  <div>
                    <h3 className="font-bold text-sm mb-2">Habilidades de clase ({chosenClassSkills.length}/{skillOpts.count})</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {skillOpts.skills.map((sk) => {
                        const selected = chosenClassSkills.includes(sk);
                        const bgSkill = background?.skillProficiencies?.some((s) => s.toLowerCase() === sk.toLowerCase());
                        const abil = skillAbilityLabel(sk);
                        const help = SKILL_HELP[sk] || '';
                        return (
                          <button key={sk} type="button" disabled={!!bgSkill} onClick={() => toggleSkill(sk)}
                            className={`text-left px-3 py-2 rounded-xl border-2 transition ${
                              bgSkill ? 'border-ink-300 bg-ink-100 text-ink-400 cursor-not-allowed'
                              : selected ? 'border-crimson-600 bg-crimson-50' : 'border-ink-300 hover:border-ink-500 bg-white'
                            }`}
                            title={bgSkill ? 'Ya otorgada por trasfondo' : help}>
                            <div className="font-bold text-sm flex items-center gap-2 flex-wrap">
                              {sk}
                              {abil && <span className="text-[10px] font-normal px-1.5 py-0.5 rounded bg-ink-100 text-ink-700">{abil}</span>}
                              {bgSkill && <span className="text-[10px] text-ink-500">trasfondo</span>}
                              {selected && !bgSkill && <span className="text-crimson-700 text-xs">✓</span>}
                            </div>
                            {help && <p className="text-[11px] text-ink-600 mt-0.5 leading-snug">{help}</p>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                {langNeed > 0 && (
                  <div>
                    <h3 className="font-bold text-sm mb-2">Idiomas adicionales ({chosenLanguages.filter(Boolean).length}/{langNeed})</h3>
                    <div className="space-y-2">
                      {Array.from({ length: langNeed }).map((_, i) => (
                        <select key={i} value={chosenLanguages[i] || ''}
                          onChange={(e) => {
                            const next = [...chosenLanguages];
                            next[i] = e.target.value;
                            setChosenLanguages(next);
                          }}
                          className="w-full px-3 py-2 border-2 border-ink-300 rounded-lg">
                          <option value="">— Elegir idioma —</option>
                          {COMMON_LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
                        </select>
                      ))}
                    </div>
                  </div>
                )}
                {(!skillOpts || skillOpts.count === 0) && langNeed === 0 && (
                  <p className="text-sm text-ink-600">No hay elecciones pendientes en este paso.</p>
                )}
              </div>
            )}

            {step === 'equipment' && (
              <div className="space-y-4">
                <div>
                  <h2 className="font-display font-bold text-lg">Equipo inicial</h2>
                  <p className="text-sm text-ink-600">Paquete de clase o oro alternativo (como en D&amp;D Beyond).</p>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setEquipMode('pack')}
                    className={`px-3 py-1.5 rounded-lg text-sm border-2 ${equipMode === 'pack' ? 'border-crimson-600 bg-crimson-50 font-bold' : 'border-ink-200'}`}>Paquete</button>
                  <button type="button" onClick={() => setEquipMode('gold')}
                    className={`px-3 py-1.5 rounded-lg text-sm border-2 ${equipMode === 'gold' ? 'border-crimson-600 bg-crimson-50 font-bold' : 'border-ink-200'}`}>Oro</button>
                </div>
                {classId && (() => {
                  const pack = (startingEquipment as any)[classId];
                  if (!pack) return <p className="text-sm text-ink-600">Sin paquete definido; podrás añadir equipo en la hoja.</p>;
                  if (equipMode === 'gold') {
                    return (
                      <p className="text-sm bg-amber-50 border border-amber-200 rounded-lg p-3">
                        Empiezas con <strong>{pack.goldAlternative ?? pack.gold ?? 0} po</strong> y sin equipo de paquete.
                      </p>
                    );
                  }
                  return (
                    <div className="space-y-3">
                      {pack.fixed?.length > 0 && (
                        <div className="text-sm space-y-1 bg-ink-50 border border-ink-200 rounded-lg p-3">
                          <strong>Equipo fijo</strong>
                          <ul className="list-disc pl-5 text-xs text-ink-700 space-y-1">
                            {pack.fixed.map((f: any, i: number) => {
                              const n = f.name || String(f);
                              const contents = formatItemList(n);
                              return (
                                <li key={i}>
                                  <span className="font-medium">{n}</span>
                                  {contents && (
                                    <span className="block text-ink-600">→ {contents}</span>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      )}
                      {(pack.choices || []).map((c: any) => (
                        <div key={c.id} className="border-2 border-ink-200 rounded-xl p-3">
                          <div className="font-bold text-sm mb-2">{c.label || c.id}</div>
                          <div className="space-y-1">
                            {c.options.map((opt: any, idx: number) => {
                              const optName = opt.name || String(opt);
                              const contents = formatItemList(optName);
                              return (
                              <label key={idx} className={`flex items-start gap-2 p-2 rounded-lg cursor-pointer ${equipChoices[c.id] === idx ? 'bg-crimson-50' : 'hover:bg-ink-50'}`}>
                                <input type="radio" name={`eq-${c.id}`} checked={equipChoices[c.id] === idx}
                                  onChange={() => setEquipChoices((prev) => ({ ...prev, [c.id]: idx }))} className="mt-1" />
                                <span className="text-sm min-w-0">
                                  <span className="font-medium">{optName}</span>
                                  {contents && (
                                    <span className="block text-[11px] text-ink-600 mt-0.5 leading-snug">
                                      Incluye: {contents}
                                    </span>
                                  )}
                                </span>
                              </label>
                              );
                            })}
                          </div>
                          {equipChoices[c.id] !== undefined && needsWeaponPick(c.options[equipChoices[c.id]]?.name || '') && (
                            <div className="mt-2 pl-6 space-y-1">
                              {Array.from({ length: weaponPickCount(c.options[equipChoices[c.id]].name) }).map((_, wi) => (
                                <select key={wi} className="w-full text-sm border border-ink-300 rounded px-2 py-1"
                                  value={(weaponPicks[c.id] || [])[wi] || ''}
                                  onChange={(e) => {
                                    const next = [...(weaponPicks[c.id] || [])];
                                    next[wi] = e.target.value;
                                    setWeaponPicks((prev) => ({ ...prev, [c.id]: next }));
                                  }}>
                                  <option value="">— Arma —</option>
                                  {weaponsForChoice(c.options[equipChoices[c.id]].name).map((w: WeaponPick) => (
                                    <option key={w.name} value={w.name}>{w.name} ({w.damage})</option>
                                  ))}
                                </select>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            )}

            {step === 'details' && (
              <div className="space-y-4">
                <div>
                  <h2 className="font-display font-bold text-lg">Identidad</h2>
                  <p className="text-sm text-ink-600">Nombre y detalles finales.</p>
                </div>
                <div>
                  <label className="block text-sm font-bold mb-1">Nombre del personaje *</label>
                  <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre del héroe"
                    className="w-full text-xl font-display px-4 py-3 border-2 border-ink-300 rounded-lg focus:border-crimson-600 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-bold mb-1">Nombre del jugador</label>
                  <input value={playerName} onChange={(e) => setPlayerName(e.target.value)} placeholder="Opcional"
                    className="w-full px-3 py-2 border-2 border-ink-300 rounded-lg" />
                </div>
                <div>
                  <label className="block text-sm font-bold mb-1">Alineamiento</label>
                  <select value={alignment} onChange={(e) => setAlignment(e.target.value)}
                    className="w-full px-3 py-2 border-2 border-ink-300 rounded-lg bg-white">
                    <option value="">— Opcional —</option>
                    {ALIGNMENTS.map((a) => <option key={a.id} value={a.name}>{a.name}</option>)}
                  </select>
                  {getAlignmentInfo(alignment) && (
                    <p className="mt-2 text-sm text-ink-700 bg-amber-50 border border-amber-200 rounded-lg p-3 leading-snug">
                      <strong>{getAlignmentInfo(alignment)!.name}.</strong>{' '}
                      {getAlignmentInfo(alignment)!.description}
                    </p>
                  )}
                  {!alignment && (
                    <p className="mt-1 text-xs text-ink-500">
                      Elige un alineamiento para ver su descripción. En el PHB 2024 es opcional.
                    </p>
                  )}
                </div>
              </div>
            )}

            {step === 'review' && (
              <div className="space-y-4">
                <div>
                  <h2 className="font-display font-bold text-lg">Resumen</h2>
                  <p className="text-sm text-ink-600">Revisa y confirma. Todo es editable después en la hoja.</p>
                </div>
                <div className="bg-white border-2 border-ink-800 rounded-xl p-4 space-y-2 text-sm">
                  <div>
                    <strong className="text-lg font-display">{name || '—'}</strong>
                    {playerName && <span className="text-ink-500"> ({playerName})</span>}
                  </div>
                  <div>{race?.name} · {classData?.name}{subclass ? ` (${subclass.name})` : ''} · Niv. 1</div>
                  <div>Trasfondo: {background?.name}</div>
                  {selectedOriginFeat && <div>Dote: {selectedOriginFeat.name}</div>}
                  {alignment && <div>Alineamiento: {alignment}</div>}
                  <div className="grid grid-cols-6 gap-1 pt-2">
                    {ABILITIES.map((a) => (
                      <div key={a} className="text-center bg-parchment-100 rounded p-1">
                        <div className="text-[9px] uppercase">{a}</div>
                        <div className="font-bold">{baseScores[a]}</div>
                      </div>
                    ))}
                  </div>
                  {chosenClassSkills.length > 0 && <div>Habilidades: {chosenClassSkills.join(', ')}</div>}
                  {chosenLanguages.filter(Boolean).length > 0 && (
                    <div>Idiomas extra: {chosenLanguages.filter(Boolean).join(', ')}</div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="hidden lg:block lg:col-span-4">
            <PreviewPanel />
          </div>
        </div>

        <div className="flex items-center justify-between mt-6 pt-4 border-t border-ink-200">
          <button type="button" onClick={goBack}
            className="flex items-center gap-1 px-4 py-2 rounded-lg border-2 border-ink-300 hover:bg-ink-100 text-sm font-medium">
            <ChevronLeft className="w-4 h-4" />
            {stepIndex === 0 ? 'Cancelar' : 'Atrás'}
          </button>
          <button type="button" disabled={!canNext()} onClick={goNext}
            className="flex items-center gap-1 px-5 py-2 rounded-lg bg-crimson-600 text-white font-bold text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-crimson-700">
            {step === 'review' ? (<><Check className="w-4 h-4" /> Crear personaje</>) : (<>Siguiente <ChevronRight className="w-4 h-4" /></>)}
          </button>
        </div>
      </div>
    </div>
  );
}
