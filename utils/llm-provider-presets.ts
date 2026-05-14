import type { LlmEndpointVariant, LlmModelOption, LlmProviderPreset } from '../types/vocabulary'

export const CUSTOM_LLM_PROVIDER_ID = 'custom'

export const LLM_PROVIDER_PRESETS: LlmProviderPreset[] = [
    {
        id: 'zhipu',
        name: 'GLM / Z.AI',
        region: 'China',
        baseUrl: 'https://api.z.ai/api/paas/v4',
        docsUrl: 'https://docs.z.ai/',
        apiKeyUrl: 'https://bigmodel.cn/usercenter/proj-mgmt/apikeys',
        defaultModel: 'glm-5',
        modelFetchStrategy: 'openai-models',
        models: [
            { id: 'glm-5', name: 'GLM-5' },
            { id: 'glm-5.1', name: 'GLM-5.1' },
            { id: 'glm-4.5-flash', name: 'GLM-4.5 Flash' },
            { id: 'glm-4-flash', name: 'GLM-4 Flash' },
        ],
        endpointVariants: [
            {
                id: 'zai-global',
                name: 'Z.AI Global',
                region: 'Global',
                baseUrl: 'https://api.z.ai/api/paas/v4',
                defaultModel: 'glm-5',
                models: [
                    { id: 'glm-5', name: 'GLM-5' },
                    { id: 'glm-5.1', name: 'GLM-5.1' },
                    { id: 'glm-4.5-flash', name: 'GLM-4.5 Flash' },
                ],
            },
            {
                id: 'zai-cn',
                name: 'BigModel China',
                region: 'China',
                baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
                defaultModel: 'glm-5',
                models: [
                    { id: 'glm-5', name: 'GLM-5' },
                    { id: 'glm-5.1', name: 'GLM-5.1' },
                    { id: 'glm-4.5-flash', name: 'GLM-4.5 Flash' },
                    { id: 'glm-4-flash', name: 'GLM-4 Flash' },
                ],
            },
            {
                id: 'zai-coding-global',
                name: 'Z.AI Global Coding Plan',
                region: 'Global',
                description: 'Dedicated coding-plan endpoint.',
                baseUrl: 'https://api.z.ai/api/coding/paas/v4',
                defaultModel: 'glm-5.1',
                models: [
                    { id: 'glm-5.1', name: 'GLM-5.1' },
                    { id: 'glm-5v-turbo', name: 'GLM-5V Turbo' },
                    { id: 'glm-4.7', name: 'GLM-4.7' },
                ],
            },
            {
                id: 'zai-coding-cn',
                name: 'BigModel China Coding Plan',
                region: 'China',
                description: 'Dedicated coding-plan endpoint.',
                baseUrl: 'https://open.bigmodel.cn/api/coding/paas/v4',
                defaultModel: 'glm-5.1',
                models: [
                    { id: 'glm-5.1', name: 'GLM-5.1' },
                    { id: 'glm-5v-turbo', name: 'GLM-5V Turbo' },
                    { id: 'glm-4.7', name: 'GLM-4.7' },
                ],
            },
        ],
    },
    {
        id: 'moonshot',
        name: 'Kimi',
        region: 'China',
        baseUrl: 'https://api.moonshot.cn/v1',
        docsUrl: 'https://platform.moonshot.cn/docs',
        apiKeyUrl: 'https://platform.moonshot.cn/console/api-keys',
        defaultModel: 'kimi-k2-turbo-preview',
        modelFetchStrategy: 'openai-models',
        omitTemperature: true,
        models: [
            { id: 'kimi-k2-turbo-preview', name: 'Kimi K2 Turbo Preview' },
            { id: 'moonshot-v1-8k', name: 'Moonshot v1 8K' },
            { id: 'moonshot-v1-32k', name: 'Moonshot v1 32K' },
            { id: 'moonshot-v1-128k', name: 'Moonshot v1 128K' },
        ],
        endpointVariants: [
            {
                id: 'kimi-cn-openai',
                name: 'Moonshot China',
                region: 'China',
                baseUrl: 'https://api.moonshot.cn/v1',
                defaultModel: 'kimi-k2-turbo-preview',
                omitTemperature: true,
                models: [
                    { id: 'kimi-k2-turbo-preview', name: 'Kimi K2 Turbo Preview' },
                    { id: 'moonshot-v1-8k', name: 'Moonshot v1 8K' },
                    { id: 'moonshot-v1-32k', name: 'Moonshot v1 32K' },
                    { id: 'moonshot-v1-128k', name: 'Moonshot v1 128K' },
                ],
            },
            {
                id: 'kimi-global-openai',
                name: 'Moonshot Global',
                region: 'Global',
                baseUrl: 'https://api.moonshot.ai/v1',
                defaultModel: 'kimi-k2-turbo-preview',
                omitTemperature: true,
                models: [
                    { id: 'kimi-k2-turbo-preview', name: 'Kimi K2 Turbo Preview' },
                    { id: 'moonshot-v1-8k', name: 'Moonshot v1 8K' },
                    { id: 'moonshot-v1-32k', name: 'Moonshot v1 32K' },
                    { id: 'moonshot-v1-128k', name: 'Moonshot v1 128K' },
                ],
            },
            {
                id: 'kimi-coding',
                name: 'Kimi Coding Plan',
                region: 'Global',
                description: 'Uses api.kimi.com/coding and the Anthropic Messages wire protocol. AnnHub will show this endpoint but cannot test it with the OpenAI-compatible client yet.',
                apiMode: 'anthropic-messages',
                baseUrl: 'https://api.kimi.com/coding/v1',
                defaultModel: 'kimi-k2.5',
                modelFetchStrategy: 'none',
                omitTemperature: true,
                models: [
                    { id: 'kimi-k2.5', name: 'Kimi K2.5' },
                    { id: 'kimi-for-coding', name: 'Kimi for Coding' },
                ],
            },
        ],
    },
    {
        id: 'deepseek',
        name: 'DeepSeek',
        region: 'China',
        baseUrl: 'https://api.deepseek.com/v1',
        docsUrl: 'https://api-docs.deepseek.com/',
        apiKeyUrl: 'https://platform.deepseek.com/api_keys',
        defaultModel: 'deepseek-chat',
        modelFetchStrategy: 'openai-models',
        models: [
            { id: 'deepseek-chat', name: 'DeepSeek Chat' },
            { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner' },
        ],
    },
    {
        id: 'xai',
        name: 'xAI',
        region: 'Global',
        baseUrl: 'https://api.x.ai/v1',
        docsUrl: 'https://docs.x.ai/',
        apiKeyUrl: 'https://console.x.ai/',
        defaultModel: 'grok-3-mini',
        modelFetchStrategy: 'openai-models',
        models: [
            { id: 'grok-3-mini', name: 'Grok 3 Mini' },
            { id: 'grok-3', name: 'Grok 3' },
            { id: 'grok-2-1212', name: 'Grok 2' },
        ],
    },
    {
        id: 'openai',
        name: 'OpenAI',
        region: 'Global',
        baseUrl: 'https://api.openai.com/v1',
        docsUrl: 'https://platform.openai.com/docs',
        apiKeyUrl: 'https://platform.openai.com/api-keys',
        defaultModel: 'gpt-4o-mini',
        modelFetchStrategy: 'openai-models',
        models: [
            { id: 'gpt-4o-mini', name: 'GPT-4o mini' },
            { id: 'gpt-4o', name: 'GPT-4o' },
            { id: 'gpt-4.1-mini', name: 'GPT-4.1 mini' },
            { id: 'gpt-4.1', name: 'GPT-4.1' },
        ],
    },
    {
        id: 'google-gemini',
        name: 'Gemini',
        region: 'Global',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
        docsUrl: 'https://ai.google.dev/gemini-api/docs/openai',
        apiKeyUrl: 'https://aistudio.google.com/app/apikey',
        defaultModel: 'gemini-2.0-flash',
        modelFetchStrategy: 'openai-models',
        models: [
            { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
            { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash' },
            { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
        ],
    },
    {
        id: 'openrouter',
        name: 'OpenRouter',
        region: 'Global',
        baseUrl: 'https://openrouter.ai/api/v1',
        docsUrl: 'https://openrouter.ai/docs',
        apiKeyUrl: 'https://openrouter.ai/settings/keys',
        defaultModel: 'openai/gpt-4o-mini',
        modelFetchStrategy: 'openai-models',
        modelsEndpoint: 'https://openrouter.ai/api/v1/models',
        models: [
            { id: 'openai/gpt-4o-mini', name: 'OpenAI GPT-4o mini' },
            { id: 'anthropic/claude-3.5-haiku', name: 'Claude 3.5 Haiku' },
            { id: 'google/gemini-flash-1.5', name: 'Gemini Flash 1.5' },
            { id: 'deepseek/deepseek-chat', name: 'DeepSeek Chat' },
        ],
    },
]

export function getLlmProviderEndpoint(
    preset: LlmProviderPreset,
    endpointId?: string
): LlmProviderPreset | LlmEndpointVariant {
    if (!endpointId) return preset
    return preset.endpointVariants?.find(endpoint => endpoint.id === endpointId) ?? preset
}

export function findLlmProviderEndpoint(
    providerPresetId?: string,
    endpointId?: string
): (LlmProviderPreset | LlmEndpointVariant) | undefined {
    const preset = findLlmProviderPreset(providerPresetId)
    if (!preset) return undefined
    return getLlmProviderEndpoint(preset, endpointId)
}

export function findLlmProviderPreset(id?: string): LlmProviderPreset | undefined {
    if (!id || id === CUSTOM_LLM_PROVIDER_ID) return undefined
    return LLM_PROVIDER_PRESETS.find(provider => provider.id === id)
}

export function normalizeLlmModelOptions(models: Array<LlmModelOption | string>): LlmModelOption[] {
    const seen = new Set<string>()
    const normalized: LlmModelOption[] = []

    for (const item of models) {
        const model = typeof item === 'string' ? { id: item } : item
        const id = model.id.trim()
        if (!id || seen.has(id)) continue
        seen.add(id)
        normalized.push({
            ...model,
            id,
            name: model.name?.trim() || id,
        })
    }

    return normalized
}
