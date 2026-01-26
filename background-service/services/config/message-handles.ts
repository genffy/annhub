import MessageUtils from "../../../utils/message"
import { ConfigService } from "."
import { GetConfigMessage, ResponseMessage, SetConfigMessage } from "../../../types/messages"

export const messageHandlers = {
    GET_CONFIG: async (message: GetConfigMessage): Promise<ResponseMessage> => {
        try {
            const configService = ConfigService.getInstance()
            let config
            if (message.configType === 'translation') {
                config = await configService.getTranslationConfig()
            } else if (message.configType === 'rules') {
                config = await configService.getTranslationRules()
            } else {
                throw new Error('Invalid config type')
            }
            return MessageUtils.createResponse(true, config)
        } catch (error) {
            return MessageUtils.createResponse(false, undefined, error instanceof Error ? error.message : 'Unknown error')
        }
    },

    SET_CONFIG: async (message: SetConfigMessage): Promise<ResponseMessage> => {
        try {
            const configService = ConfigService.getInstance()
            if (message.configType === 'translation') {
                await configService.setTranslationConfig(message.config as any)
            } else if (message.configType === 'rules') {
                await configService.setTranslationRules(message.config as any)
            } else {
                throw new Error('Invalid config type')
            }
            return MessageUtils.createResponse(true)
        } catch (error) {
            return MessageUtils.createResponse(false, undefined, error instanceof Error ? error.message : 'Unknown error')
        }
    },

    INITIALIZE_CONFIG: async (): Promise<ResponseMessage> => {
        try {
            const configService = ConfigService.getInstance()
            await configService.initialize()
            return MessageUtils.createResponse(true)
        } catch (error) {
            return MessageUtils.createResponse(false, undefined, error instanceof Error ? error.message : 'Unknown error')
        }
    },

    RESET_CONFIG: async (): Promise<ResponseMessage> => {
        try {
            const configService = ConfigService.getInstance()
            await configService.resetToDefaults()
            return MessageUtils.createResponse(true)
        } catch (error) {
            return MessageUtils.createResponse(false, undefined, error instanceof Error ? error.message : 'Unknown error')
        }
    },

}