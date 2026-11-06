package com.haoxin.wordatlas;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(MediaPackPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
