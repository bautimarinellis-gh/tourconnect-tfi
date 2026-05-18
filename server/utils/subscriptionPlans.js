const SUBSCRIPTION_PLANS = Object.freeze({
  Starter: {
    label: 'Starter',
    maxAgencias: 20,
  },
  Professional: {
    label: 'Professional',
    maxAgencias: 100,
  },
  Enterprise: {
    label: 'Enterprise',
    maxAgencias: null,
  },
});

const SUBSCRIPTION_PLAN_NAMES = Object.keys(SUBSCRIPTION_PLANS);

const getSubscriptionPlan = (planName) => {
  return SUBSCRIPTION_PLANS[planName] || SUBSCRIPTION_PLANS.Starter;
};

module.exports = {
  SUBSCRIPTION_PLANS,
  SUBSCRIPTION_PLAN_NAMES,
  getSubscriptionPlan,
};
