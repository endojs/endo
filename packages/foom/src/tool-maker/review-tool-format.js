export const toolReviewerResponseFormat = {
  type: 'json_schema',
  json_schema: {
    name: 'query_response',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        feedback: {
          type: 'string',
        },
        approved: {
          type: 'boolean',
        },
      },
      required: ['feedback', 'approved'],
      additionalProperties: false,
    },
  },
};
