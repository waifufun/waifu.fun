import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyReply } from "fastify";
import { ResponseCodeEnums } from "@autofun/types";

// empty for now
export type FastifyResponsesOptions = {};

const fastifyResponsesPluginLogic = async (
    fastify: FastifyInstance,
    options: FastifyResponsesOptions
) => {
    fastify.decorateReply("sendJSONResponse", function (this: FastifyReply, status: ResponseCodeEnums, data: object) {
        this.status(status).send({
            statusCode: status,
            statusMessage: ResponseCodeEnums[status],
            data: data,
        });
        return this;
    });

    fastify.decorateReply("sendMessage", function (this: FastifyReply, status: ResponseCodeEnums, message: string) {
        this.status(status).send({
            statusCode: status,
            statusMessage: ResponseCodeEnums[status],
            message: message,
        });
        return this;
    });
};

// wrap
export const fastifyResponses = fp(fastifyResponsesPluginLogic, {
    fastify: '5.x',
    name: '@autofun/fastify-responses'
});

declare module "fastify" {
    interface FastifyReply {
        sendJSONResponse(status: ResponseCodeEnums, data: object): FastifyReply;
        sendMessage(status: ResponseCodeEnums, message: string): FastifyReply;
    }
}