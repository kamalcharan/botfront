import moment from 'moment';
import { union } from 'lodash';

const roundPercent = num => (num * 100).toFixed(2);

const smartTips = (flags) => {
    let code;
    let message;
    let tip;
    let extraEntities = [];
    const {
        outdated, intentBelowTh, entitiesBelowTh, entitiesInTD, aboveTh,
    } = flags;
    if (outdated) {
        tip = 'Outdated';
        message = 'The model was trained since this utterance was logged.';
        code = 'outdated';
    }
    if (intentBelowTh) {
        tip = 'Low confidence';
        code = 'intentBelowTh';
        message = intentBelowTh.confidence > 0
            ? `Intent *${intentBelowTh.name}* was predicted with confidence ${roundPercent(intentBelowTh.confidence)}, which is below your set threshold.`
            : 'You have made some changes to the labeling.';
    }
    if (entitiesBelowTh) {
        tip = 'Low confidence';
        code = 'entitiesBelowTh';
        const plural = entitiesBelowTh.length > 1;
        const entityNames = entitiesBelowTh.map(entity => `*${entity.name}*`);
        const entityConf = entitiesBelowTh.map(entity => roundPercent(entity.confidence));
        message = entityConf.every(conf => conf > 0)
            ? `Entit${plural ? 'ies' : 'y'} ${entityNames.join(', ')} ${plural ? 'were' : 'was'} predicted
                with confidence ${entityConf.join(', ')}, which is below your set threshold.`
            : 'You have made some changes to the labeling.';
    }
    if (entitiesInTD) {
        tip = 'High confidence';
        code = 'entitiesInTD';
        extraEntities = entitiesInTD;
        const plural = entitiesInTD.length > 1;
        message = `Are you sure this utterance does not contain entit${plural ? 'ies' : 'y'} ${entitiesInTD.map(e => `*${e}*`).join(', ')}?
        If so, we recommend you delete this utterance, since confidence levels of prediction exceed your set threshold.`;
    }
    if (aboveTh) {
        tip = 'High confidence';
        code = 'aboveTh';
        const { intent, entities } = aboveTh;
        if (entities.length > 0) {
            const plural = entities > 1;
            const entityNames = entities.map(entity => `*${entity.name}*`);
            message = `Intent *${intent.name}* and entit${plural ? 'ies' : 'y'} ${entityNames.join(', ')} were predicted
            with a confidence level above your set threshold. We recommend you delete this kind of utterance.`;
        } else {
            message = `Intent *${intent.name}* was predicted with a confidence level above your set threshold. We recommend you delete this kind of utterance.`;
        }
    }

    return {
        tip, code, message, extraEntities,
    };
};

const isUtteranceOutdated = ({ training: { endTime } = {} }, { updatedAt }) => moment(updatedAt).isBefore(moment(endTime));

const getSimilarTD = (model, utterance) => {
    // const synonyms = model.training_data.entity_synonyms;
    // const gazette = model.training_data.gazette;
    const utteranceEntities = utterance.entities.map(entity => entity.entity);
    const examples = model.training_data.common_examples
        .filter((example) => {
            if (example.intent !== utterance.intent) return false;
            const exEntities = example.entities.map(entity => entity.entity);
            return (utteranceEntities.every(entity => exEntities.includes(entity))
                && exEntities.some(entity => !utteranceEntities.includes(entity)));
        });
    return examples;
};

export const getSmartTips = (model, project, utterance) => {
    const th = project.nluThreshold;

    if (isUtteranceOutdated(project, utterance)) return smartTips({ outdated: true });

    const intentBelowTh = utterance.confidence < th ? { name: utterance.intent, confidence: utterance.confidence } : null;
    if (intentBelowTh) return smartTips({ intentBelowTh });

    const entitiesBelowTh = utterance.entities.filter(entity => entity.confidence < th)
        .map(entity => ({ name: entity.entity, confidence: entity.confidence }));
    if (entitiesBelowTh.length) return smartTips({ entitiesBelowTh });

    const entitiesInUt = utterance.entities.map(entity => entity.entity);
    const entitiesInTD = union(
        ...getSimilarTD(model, utterance)
            .map(td => td.entities.map(entity => entity.entity)),
    ).filter(entity => !entitiesInUt.includes(entity));
    if (entitiesInTD.length) return smartTips({ entitiesInTD });

    return smartTips({
        aboveTh: {
            intent: { name: utterance.intent },
            entities: utterance.entities.map(entity => ({ name: entity.entity })),
        },
    });
};

export const getAllSmartTips = (model, project, utterances) => {
    const allTips = {};
    utterances.forEach((utterance) => {
        allTips[utterance._id] = getSmartTips(model, project, utterance);
    });
    return allTips;
};
