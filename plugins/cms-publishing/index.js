'use strict';

/**
 * Sample trusted plugin for the CMS template.
 *
 * Plugins receive record data only and return field changes; the platform
 * validates those changes against the entity metadata like any user input.
 *
 * @param {import('@bytecontent/contracts').PluginApi} api
 */
function register(api) {
  /** @type {import('@bytecontent/contracts').BeforeHookHandler} */
  const publishing = ({ fields, data, previous }) => {
    const changes = {};
    const becamePublished =
      data.status === 'published' && (!previous || previous.status !== 'published');
    if (becamePublished && !data.publishedAt && fields.includes('publishedAt')) {
      changes.publishedAt = new Date().toISOString();
    }
    if (!data.seoTitle && typeof data.title === 'string' && fields.includes('seoTitle')) {
      changes.seoTitle = data.title.slice(0, 70);
    }
    return changes;
  };

  api.on('record.beforeCreate', publishing);
  api.on('record.beforeUpdate', publishing);
  api.on('record.afterCreate', ({ entity, recordId, data }) => {
    if (data.status === 'published') api.log(`${entity} ${recordId} published`);
  });
}

module.exports = { register };
