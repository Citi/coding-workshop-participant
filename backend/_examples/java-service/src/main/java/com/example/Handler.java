package com.example;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import java.util.HashMap;
import java.util.Map;

public class Handler implements RequestHandler<Map<String, Object>, Map<String, Object>> {

    private static final Gson gson = new GsonBuilder().setPrettyPrinting().create();

    @Override
    public Map<String, Object> handleRequest(Map<String, Object> event, Context context) {
        if (context != null) {
            context.getLogger().log("Received event: " + gson.toJson(event));
        } else {
            System.out.println("Received event: " + gson.toJson(event));
        }

        Map<String, Object> response = new HashMap<>();
        response.put("statusCode", 200);

        Map<String, String> headers = new HashMap<>();
        headers.put("Content-Type", "application/json");
        response.put("headers", headers);

        Map<String, String> body = new HashMap<>();
        body.put("message", "Hello, World!");
        response.put("body", gson.toJson(body));

        return response;
    }

    public static void main(String[] args) {
        Handler handler = new Handler();
        Map<String, Object> event = new HashMap<>();
        event.put("test", "event");
        Map<String, Object> result = handler.handleRequest(event, null);
        System.out.println(gson.toJson(result));
    }
}
